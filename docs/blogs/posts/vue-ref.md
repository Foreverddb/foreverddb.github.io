---
title: Vue源码解析-响应式系统篇
date: 2024-01-23
category: 笔记
tags:
- 前端
- 源码
- vue
brief: Vue3响应式系统的源码解析，结合个人复现vue的浅薄经验，逐行解析核心设计思路以及实现细节，以期更好地理解vue的整体原理。
---

> 在vue3中，响应式模块被提取为一个独立的api，与vue框架本身解耦，同时提供了很多新的响应式能力，为我们提供了一个全面、方便、可控的响应式能力集合。其中源码使用了众多es6新特性、新的设计思路。本文旨在深度分析vue3响应式源码的核心流程，不仅关注代码做了什么，还要关注为什么，以个人的理解来逐步分析vue3响应式api源码的主要实现，用通俗的解释和更方便的小tips来讲解源码，包含了核心的响应式函数`reactive`、`ref`、`watch`、`computed`的代码细节与其内部整体结构`trigger`、`track`、`effect`等重要模块，帮助读者更深入理解vue的响应式原理。

# Vue源码解析-响应式系统篇

本文基于`Vue3.4.15`编写。

源码仓库：[https://github.com/vuejs/core](https://github.com/vuejs/core)

在vue3中关于响应式的组合式api位于目录`packages/reactivity/src`中，其包含如下文件：

- dep.ts
- baseHandler.ts
- collectionHandler.ts
- computed.ts
- effect.ts
- effectScope.ts
- operations.ts
- reactive.ts
- reactiveEffect.ts
- readonly.ts
- ref.ts

这就是vue3响应式api的核心，并且作为组合式api独立暴露出来，是vue3中最为重要的一个模块。脱离vue本身，其通用响应式能力也可以用于很多与vue无关的项目，其根本在于其动态收集依赖与绑定副作用函数的能力，与vue的渲染过程解耦，可以用于一般的node与浏览器环境。

> vue设计的理念也是如此。理论上，vue只提供一个MVVM的框架能力，而并不关心其运行的环境。正因如此，虽然vue是一个最常用于web的框架，你依然可以通过覆盖其默认的dom渲染方式来支持个性化的实现。

## 基础概念

什么是副作用？我们可以认为是在一个函数的执行，对函数外部的某些其他变量/函数造成了影响，这个影响就是副作用。

试看如下代码：

```typescript
const data = { text: '文字' };
function effect() {
  dom.innerText = data.text;
}
```

我们可以认为，`effect`函数包含了data变量的**副作用**，而data变量就是副作用函数`effect`的**依赖**。因为一旦当`data`的text属性在任何其他地方发生了修改，effect的执行结果就会发生变化。

在vue中，我们使用响应式api例如`ref`创建的数据，将其嵌入在HTML中，当我们修改其数据的值时，HTML展示的内容也会随之变化，其本质就是因为其DOM的渲染具有与其响应式数据相关联的副作用。而能够实现其修改`ref`变量即可触发副作用重新执行的系统，即可称为**响应式系统**。

> 正常情况下，我们在编写函数时常常会想要避免副作用，因为对于原生的js变量来说，我们难以追踪一个变量存在哪些副作用，而哪些函数的依赖又是哪些的。这种不明确性对于常规的编程来说很难接受（事实上，对于一些涉及全局状态的操作副作用是无法避免的。但是对于一般的函数式编程来说我们始终应该保证变量的修改和读取是统一实现、可以管理的）。vue实现的响应式系统使我们可以不用关注渲染层面的副作用，只需知道当响应式数据发生改变时会导致相关视图的重新渲染。

## 依赖追踪与副作用收集、触发

要实现响应式系统，首先需要具有收集副作用与管理依赖的能力，即当一个响应式数据发生变化时我们知道会触发哪些副作用函数，同时也需要知道一个副作用函数会在哪些数据变化时被触发。

例如：

```typescript
const obj1 = { text: 'a' };
const obj2 = { text: 'b' };

function effect1() {
  console.log(obj1.text, obj2.text);
}
function effect2() {
  console.log(obj2.text);
}
```

正常情况下，我们期待当`obj2`发生变化时会导致`effect1`和`effect2`的触发，同时`obj1`变化时只会导致`effect1`的触发。这样依赖和副作用的对应关系可以避免我们触发不必要的函数，毕竟谁也不希望vue的一个数据的修改会导致另一个无关组件的重新渲染。

为了达成目标，我们可以划分几个主要部分：

1. `track`：当读取一个响应式变量的值时，触发依赖收集（即在副作用函数中若使用到了其值，则将其收集为此函数的依赖）
2. `trigger`：当一个响应式变量的值被修改时，即触发其相关所有的副作用函数（所有使用到其值的副作用函数）
3. `effect`：用于注册副作用函数，其表明只有被其注册的副作用函数会成为`副作用`而被依赖收集与重新触发，以与其他普通的使用到响应式变量的函数相区分。

### track

为了实现在有读取数据的地方能自动运行`track`方法，我们需要一种能力让响应式对象被读取或修改时通知我们。ES6标准下的`Proxy`对象就支持这种能力，它允许我们设置拦截器来代理对象的各种基本操作。

例如：

```typescript
const originObj = {
	text: 'foo'
}
const refObj = new Proxy(originObj, {
  get(target, key) {
    console.log('get key:' + key)
    return target[key]
  }
})
```

> 由于`Proxy`仅能代理对象类型，对于`string/number/boolean`等原始数据类型无能为力，因此要实现原始类型的响应式，需要我们手动封装一个对象，并通过例如`value`属性来暴露其值，这便是`ref()`区别于`reactive()`的原因之一。

虽然`Proxy`可以告诉我们一个对象的属性受到了什么操作，但却依然不知道其操作来源是哪一个副作用函数，这时就需要`effect`函数发挥作用了。`effect`帮助我们注册一个副作用函数，当其副作用函数运行时，被读取的响应式对象可以从中得到当前注册的副作用函数以便于依赖的绑定。`effect`的具体实现将在专门的一个部分详解，目前我们只需要假定它已经具有一个基本功能：将作为参数传给它的函数推入一个全局的副作用函数栈。

现在思考如下流程：

1. 通过调用`reactive(target)`创建一个响应式对象，传入原始对象
2. 判断对象类型，处理报错、判断是否已经为响应式等
3. 判断是否已存在相同的响应式对象
4. 创建`Proxy`代理并收集入响应式对象池
5. 返回代理对象

vue3以几个`WeakMap`作为响应式对象池来统一管理所有的响应式对象，以`target`对象为`key`，以其对应的响应式代理对象为`value`，这样可以方便地复用响应式对象：

```typescript
  const existingProxy = proxyMap.get(target)
  if (existingProxy) {
    return existingProxy
  }
```

> `WeakMap`在使用上与`Map`并没有什么不同，唯一的区别在于其`key`必须是对象或局部声明的`Symbol`。`WeakMap`的键与值之间并没有建立强引用，它不阻止其对象被垃圾回收，换句话说，当某个作为键的对象没有在任何其他地方被引用后，`WeakMap`就会删除其储存的值。

在整个`reactive`的流程中，第4点是我们最需要关注的一点。其流程源码如下：

```typescript
  const proxy = new Proxy(
    target,
    targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers,
  )
  proxyMap.set(target, proxy)
```

在传给`Proxy`的handler处有个判断，根据target的不同类型来给不同的handler。其判断方法如下：

```typescript
function targetTypeMap(rawType: string) {
  switch (rawType) {
    case 'Object':
    case 'Array':
      return TargetType.COMMON
    case 'Map':
    case 'Set':
    case 'WeakMap':
    case 'WeakSet':
      return TargetType.COLLECTION
    default:
      return TargetType.INVALID
  }
}
```

可以看出对`Map`和`Set`等做了专门处理，以区分于常规的对象，这是因为他们读取属性的方式与常规对象有所不同。

这里先看常规对象使用的handler部分：

```typescript
// reactive使用的baseHandlers
export const mutableHandlers: ProxyHandler<object> =
  /*#__PURE__*/ new MutableReactiveHandler()

class MutableReactiveHandler extends BaseReactiveHandler {
  constructor(shallow = false) {
    super(false, shallow)
  }

  set(
    target: object, key: string | symbol, value: unknown, receiver: object,
  ): boolean {
    ...
  }

  deleteProperty(target: object, key: string | symbol): boolean {
    ...
  }

  has(target: object, key: string | symbol): boolean {
    ...
  }

  ownKeys(target: object): (string | symbol)[] {
    ...
  }
}
```

`MutableReactiveHandler`类实现了对`set`，`deleteProperty`，`has`，`ownKeys`的代理，而在其继承的`BaseReactiveHandler`则实现了对`get`的代理：

```typescript
class BaseReactiveHandler implements ProxyHandler<Target> {
  constructor(
    protected readonly _isReadonly = false,
    protected readonly _shallow = false,
  ) {}

  get(target: Target, key: string | symbol, receiver: object) {
    ...
  }
}
```

其中，构造函数可以看出通过`reactive`创建的响应式常规对象，默认是非只读和深层响应式的。深层响应式意味着它深层遍历了对象的每一个引用类型的属性并为其设置代理，这里我们暂且不讨论深浅代理和是否只读的区别。

#### 在get代理中track

在代理函数中首先进行了取值的判断，对一些`reactive`对象的特殊属性进行返回处理：

```typescript
  get(target: Target, key: string | symbol, receiver: object) {
    const isReadonly = this._isReadonly,
      shallow = this._shallow
    if (key === ReactiveFlags.IS_REACTIVE) {
      // 是否响应式对象
      return !isReadonly
    } else if (key === ReactiveFlags.IS_READONLY) {
      // 是否只读
      return isReadonly
    } else if (key === ReactiveFlags.IS_SHALLOW) {
      // 是否浅代理
      return shallow
    } else if (key === ReactiveFlags.RAW) {
      // 返回原始对象
      if (
        receiver ===
          (isReadonly
            ? shallow
              ? shallowReadonlyMap
              : readonlyMap
            : shallow
              ? shallowReactiveMap
              : reactiveMap
          ).get(target) ||
        // receiver is not the reactive proxy, but has the same prototype
        // this means the reciever is a user proxy of the reactive proxy
        Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)
      ) {
        return target
      }
      // early return undefined
      return
    }

    ...
  }
```

接下来逐步看函数的核心部分：

```typescript
const targetIsArray = isArray(target)

if (!isReadonly) {
  if (targetIsArray && hasOwn(arrayInstrumentations, key)) {
    return Reflect.get(arrayInstrumentations, key, receiver)
  }
  if (key === 'hasOwnProperty') {
    return hasOwnProperty
  }
}
```

首先是对原始对象为数组的情况进行处理。先看内部第一个`if`块：

```typescript
targetIsArray && hasOwn(arrayInstrumentations, key)
```

`hasOwn()`本质是通过`Object.prototype.hasOwnProperty`方法来判断一个对象是否存在某个键：

```typescript
const hasOwnProperty = Object.prototype.hasOwnProperty
export const hasOwn = (
  val: object,
  key: string | symbol,
): key is keyof typeof val => hasOwnProperty.call(val, key)
```

而`arrayInstrumentations`则是覆盖实现了数组的内置方法：

```typescript
const arrayInstrumentations = /*#__PURE__*/ createArrayInstrumentations()

function createArrayInstrumentations() {
  const instrumentations: Record<string, Function> = {}
  // instrument identity-sensitive Array methods to account for possible reactive
  // values
  ;(['includes', 'indexOf', 'lastIndexOf'] as const).forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = toRaw(this) as any
      for (let i = 0, l = this.length; i < l; i++) {
        track(arr, TrackOpTypes.GET, i + '')
      }
      // we run the method using the original args first (which may be reactive)
      const res = arr[key](...args)
      if (res === -1 || res === false) {
        // if that didn't work, run it again using raw values.
        return arr[key](...args.map(toRaw))
      } else {
        return res
      }
    }
  })
  // instrument length-altering mutation methods to avoid length being tracked
  // which leads to infinite loops in some cases (#2137)
  ;(['push', 'pop', 'shift', 'unshift', 'splice'] as const).forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      pauseTracking()
      pauseScheduling()
      const res = (toRaw(this) as any)[key].apply(this, args)
      resetScheduling()
      resetTracking()
      return res
    }
  })
  return instrumentations
}
```

其本质是拦截了数组的默认方法并在其中进行`track`操作，这里的`track()`的功能可以简单理解为将当前对象与其访问的`key`与对应的副作用函数进行绑定，而绑定的目标副作用函数是通过`effect`注册的。其具体的实现将在后续详解，我们当前仅需要理解与数组有关的操作。

对于`includes`, `indexOf`, `lastIndexOf`的情况，由于是涉及到所有数据的查找操作，因此需要对数组所有的值建立响应式联系。

而对于`push`等方法，由于其调用过程会同时隐式地对`length`的读取和修改操作，导致副作用相互影响，产生无限循环触发副作用的问题。试想如下一个情景：

```typescript
const arr = reactive([]) 
// 第一个副作用函数
effect(() => {
  arr.push(1)
})
// 第二个副作用函数
effect(() => { 
  arr.push(1)
})
```

我们假设`effect()`函数已经有充分的优良设计可以避免在同一个副作用函数中触发自身导致循环，在上述例子中，我们成功注册了第一个副作用函数，由于其`push()`方法导致其与`length`属性建立了联系，因此在第二个副作用函数执行过程中便会触发第一个副作用函数（因为第二个副作用函数会修改length属性），而重新执行第一个副作用函数又回触发刚刚与`length`建立联系的第二个副作用函数，如此循环最终会导致爆栈。

因此我们使用`pauseTracking()`来在数组的此类操作时暂停响应式追踪，避免其隐式地与`length`产生响应式联系，在操作后`resetTracking()`来重新允许追踪。

处理完了数组的特殊情况，接下来便是对于`get`的核心实现部分：

```typescript
const res = Reflect.get(target, key, receiver)
```

首先通过`Reflect.get()`获取对应属性数据，此处不使用`target[key]`直接获取值的原因在于处理不同属性之间的交叉引用。试看如下例子：

```typescript
const obj = {
  foo: 1,
  get bar() {
    return this.foo
  }
};
```

根据此对象创建的响应式对象，当获取`bar`属性时，通过`target[key]`的方式取值无法与`foo`属性建立响应式依赖，因为它本质是调用原始对象`target`的`bar()`来取值，而通过`Reflect.get(target, key, receiver)`则可以将`Proxy`类型的对象`receiver`作为`this`的实际指向传入，因此可以触发代理函数，嵌套地建立依赖关系。

接下来：

```typescript
const res = Reflect.get(target, key, receiver)

if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
  return res
}
```

此处的`builtInSymbols.has(key)`用于判断是否为内置的保留`symbol`，如`Symbol.hasInstance`，若是则直接返回值。`isNonTrackableKeys(key)`则用于判断是否为无需建立响应式关系的vue内置键，分别为`__proto__`、`__v_isRef`和`__isVue`。键为以上两种情况时都无需建立响应关系，直接作为普通的`get`操作返回值。

接下来的`key`则可以认为是都需要建立响应式关系：

```typescript
if (!isReadonly) {
  track(target, TrackOpTypes.GET, key)
}
```

这里第二个参数代表着对该属性的读取方式，其定义了3个类型：

```typescript
export enum TrackOpTypes {
  GET = 'get',
  HAS = 'has',
  ITERATE = 'iterate',
}
```

其分别对应正常通过`key`读取属性(get)、通过`in`操作符读取属性(has)、遍历对象键(ownKeys)。事实上这个属性在`track()`中的作用仅仅是便于调试，我们可以跳过对它的理解。

剩下的还有一些情况判断，需要注意的是当目标值为对象时，需要嵌套使用`reactive()`包裹以实现深层响应：

```typescript
    if (shallow) {
      return res
    }

    if (isRef(res)) {
      // ref unwrapping - skip unwrap for Array + integer key.
      return targetIsArray && isIntegerKey(key) ? res : res.value
    }

    if (isObject(res)) {
      // Convert returned value into a proxy as well. we do the isObject check
      // here to avoid invalid value warning. Also need to lazy access readonly
      // and reactive here to avoid circular dependency.
      return isReadonly ? readonly(res) : reactive(res)
    }

    return res
```

#### 具体实现

现在来看`track`函数的具体实现：

```typescript
const targetMap = new WeakMap<object, KeyToDepMap>()

export function track(target: object, type: TrackOpTypes, key: unknown) {
  if (shouldTrack && activeEffect) {
    let depsMap = targetMap.get(target)
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()))
    }
    let dep = depsMap.get(key)
    if (!dep) {
      depsMap.set(key, (dep = createDep(() => depsMap!.delete(key))))
    }
    trackEffect(
      activeEffect,
      dep,
      __DEV__
        ? {
            target,
            type,
            key,
          }
        : void 0,
    )
  }
}
```

在这里`targetMap`即是响应式对象的副作用函数依赖桶，其类型定义如下：

```typescript
type KeyToDepMap = Map<any, Dep>
export type Dep = Map<ReactiveEffect, number> & {
  cleanup: () => void
  computed?: ComputedRefImpl<any>
}

const targetMap = new WeakMap<object, KeyToDepMap>()
```

其本质是以`target`的对应属性为键，对应的副作用函数列表为值的一个树状依赖，近似如下结构：

```
- target1
  - key1
    - effect1
    - effect2
  - key2
    - effect1
    - effect2
    - effect3
- target2
...
```

我们回到`track`代码，其前面的部分主要是作判断和初始化的操作，如无对应`Map`则进行创建等：

```typescript
// 这里的shouldTrack与处理数组的parseTrack和resetTracking相关，控制是否进行响应式追踪
// activeEffect则代表当前正在注册的副作用函数
if (shouldTrack && activeEffect) {
    let depsMap = targetMap.get(target)
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()))
    }
    let dep = depsMap.get(key)
    if (!dep) {
      depsMap.set(key, (dep = createDep(() => depsMap!.delete(key))))
    }
  trackEffect(...)
}
```

重点在于`trackEffect`函数：

```typescript
export function trackEffect(
  effect: ReactiveEffect,
  dep: Dep,
  debuggerEventExtraInfo?: DebuggerEventExtraInfo,
) {                                                                    
  if (dep.get(effect) !== effect._trackId) {
    dep.set(effect, effect._trackId)
    const oldDep = effect.deps[effect._depsLength]
    if (oldDep !== dep) {
      if (oldDep) {
        cleanupDepEffect(oldDep, effect)
      }
      effect.deps[effect._depsLength++] = dep
    } else {
      effect._depsLength++
    }

    // 调用钩子函数，传递调试信息
    if (__DEV__) {
      effect.onTrack?.(extend({ effect }, debuggerEventExtraInfo!))
    }
  }
}
```

首先是一个判断：

```typescript
dep.get(effect) !== effect._trackId
```

在这里，我们暂且认为`_trackId`是一个代表依赖相关性的属性，它分别被记录在副作用函数上和副作用函数对应的依赖上。在`track`阶段，发现副作用函数和依赖处记录的`_trackId`不同，则触发依赖记录和`_trackId`的更新。`_trackId`发挥作用是在后续的依赖清除环节，它被用来判断副作用函数与其依赖是否相关，这部分会在后面详细分析。

```typescript
dep.set(effect, effect._trackId)
const oldDep = effect.deps[effect._depsLength]
```

首先，在依赖中添加副作用函数，key为副作用函数，value为`_trackId`。然后从副作用函数的`deps`中取得目标位置的依赖，需要注意`effect._depsLength`并没有减一，表明这是数组最后一个有效位置的下一位。

`effect`函数的`deps`属性实质上是一个反向依赖，`depsMap`记录了一个`target`的每个`key`对应的副作用函数列表，而反之，每个副作用函数的`deps`就记录了所有它所处的副作用函数列表。

> 为什么要做这样一个双向的追踪呢？试想副作用函数中存在一个分支结构：`isOk ? a.text : b.text`，第一次执行时`isOk`为true，`a`的`text`属性被收集为依赖，当其更改时会导致重新运行当前副作用函数。而当`isOk`为false时，我们期望`a.text`的更改将不会再触发副作用，所以我们需要一个依赖清除的能力。`effect.deps`会储存每一个用到了`effect`的副作用函数列表(即每一个用到了`effect`的具体`target.key`对应的副作用函数函数Map)，以便在自己运行时清除所有自己想关的依赖。由于副作用函数运行时本身会重新建立依赖，所以不用担心清除后依赖失效的问题。实际的依赖建立和清理的实现更为复杂，也会涉及到前文讲到的`_trackId`属性，具体放在`effect()`的具体实现部分进行解析。


```typescript
if (oldDep !== dep) {
  if (oldDep) {
    cleanupDepEffect(oldDep, effect)
  }
  effect.deps[effect._depsLength++] = dep
} 
else {
  effect._depsLength++
}
```

结合前面获取`oldDep`的方式，可以判断这里实际是一个类似数组的`push`操作，只不过先判断了是否已经存在与目标依赖相同的依赖，若不相同则正常处理依赖的清除和新增。

至此，我们便成功完成了`track`的核心能力：为响应式对象和副作用函数建立双向依赖。

#### 其他触发track的情况

get是对一个对象属性最直观的访问操作，它是直接通过对象属性的索引来访问的。而此外，还存在一些隐式的、不直观的操作，它们同样读取了对象属性，需要进行依赖追踪和副作用收集。

`has`是针对 in 操作符的代理方法，其用于判断某个属性是否存在于该对象或其原型链上。其拦截器函数如下：

```typescript
has(target: object, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  if (!isSymbol(key) || !builtInSymbols.has(key)) {
    track(target, TrackOpTypes.HAS, key)
  }
  return result
}
```

`ownKeys`可以拦截获取对象所属`key`的操作，包括`Object.getOwnPropertyNames()`、`Object.getOwnPropertySymbols()`、`Object.keys()`和`Reflect.ownKeys()`。其拦截器函数如下：

```typescript
ownKeys(target: object): (string | symbol)[] {
  track(
    target,
    TrackOpTypes.ITERATE,
    isArray(target) ? 'length' : ITERATE_KEY,
  )
  return Reflect.ownKeys(target)
}
```

由于此处是用于遍历对象属性的，其与目标对象的关联是对象的属性列表，所以并不应该与某特定的属性建立依赖关系，而仅应该在属性发生增删/索引变化时触发。因此，对于数组，对`length`进行追踪，对于普通对象，则使用一个唯一的`Symbol`类型进行标记（这样可以避免影响到对象的正常属性）：

```typescript
export const ITERATE_KEY = Symbol(__DEV__ ? 'iterate' : '')
```

然后对于普通对象的属性变化，我们手动在对应的操作下触发`ITERATE_KEY`的副作用即可。

#### collection类型对象的代理

```typescript
if (key === ReactiveFlags.IS_REACTIVE) {
  return !isReadonly
} else if (key === ReactiveFlags.IS_READONLY) {
  return isReadonly
} else if (key === ReactiveFlags.RAW) {
  return target
}

return Reflect.get(
  hasOwn(instrumentations, key) && key in target
    ? instrumentations
    : target,
  key,
  receiver,
)
```

整体并不复杂，需要注意的是这一行：

```typescript
hasOwn(instrumentations, key) && key in target
```

这里首先判断了`instrumentations`中是否存在对应`key`，若存在，则将`target`改为`instrumentations`传入`Reflect.get`。

我们再看`instrumentations`的实现，它覆盖实现了`collection`类型对象的方法，便于我们进行劫持：

```typescript
const mutableInstrumentations: Record<string, Function | number> = {
  get(this: MapTypes, key: unknown) {
    return get(this, key)
  },
  get size() {
    return size(this as unknown as IterableCollections)
  },
  has,
  add,
  set,
  delete: deleteEntry,
  clear,
  forEach: createForEach(false, false),
}
```

接下来分别解析几个通用的`collection`函数的代理：

以`Map`类型为例，当我们调用其`get()`方法来取值时，实际上在代理函数中的`key`为`get`，而我们再通过`Reflect.get()`来返回需要取得的`Map.get()`函数。为了取得劫持，我们实际上通过`instrumentations`来替换了`Map.get()`方法，所以`get`代理返回的`Map.get()`方法实际上是`instrumentations`中的`get`方法，并为其绑定了代理对象为函数的`this`。

> 对象方法的调用流程，我们可以分为两个步骤，一是从对象读取改方法值（此时方法是作为属性被读取的），二是调用方法。可以假设其调用流程为：`Function.prototype.call(obj.func, obj)`，因此第一步会触发对象的`get`代理，第二步会触发该方法的`apply`代理。

因此实际上`Map.get()`调用函数如下：

```typescript
function get(
  target: MapTypes,
  key: unknown,
  isReadonly = false,
  isShallow = false,
) {
  // #1772: readonly(reactive(Map)) should return readonly + reactive version
  // of the value
  target = (target as any)[ReactiveFlags.RAW]
  const rawTarget = toRaw(target)
  const rawKey = toRaw(key)
  if (!isReadonly) {
    if (hasChanged(key, rawKey)) {
      track(rawTarget, TrackOpTypes.GET, key)
    }
    track(rawTarget, TrackOpTypes.GET, rawKey)
  }
  const { has } = getProto(rawTarget)
  const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive
  if (has.call(rawTarget, key)) {
    return wrap(target.get(key))
  } else if (has.call(rawTarget, rawKey)) {
    return wrap(target.get(rawKey))
  } else if (target !== rawTarget) {
    // #3602 readonly(reactive(Map))
    // ensure that the nested reactive `Map` can do tracking for itself
    target.get(key)
  }
}
```

其流程并不复杂，主要是做不同情况下的工程处理，然后通过`track()`来建立依赖，通过`target.get(key)`来返回实际的`Map.get()`值。

其他的相关函数都与此类似，故不做额外分析。


### trigger
  
我们回到响应式对象拦截器创建的部分。已经知道在对象属性的读取（get操作）时回触发依赖追踪和副作用收集，那么接下来就是在属性发生修改时能够触发相应的依赖。

#### 在修改时trigger

修改数据的方式有很多，`set`是最为常用的一种。其相比`get`只是多了一个返回的布尔值，表示是否修改成功：

```typescript
set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: object,
  ): boolean {
    ...
}
```

在拦截器的具体实现中，首先依然是对于不同情况的判断。

若响应式对象并非浅响应式，且原属性值是`Ref`类型的的对象，则深层进行`Ref`对象方式的赋值（通过`.value`属性）与转化，而在浅响应模式中则对其原样赋值。

```typescript
let oldValue = (target as any)[key]
if (!this._shallow) {
  const isOldValueReadonly = isReadonly(oldValue)
  if (!isShallow(value) && !isReadonly(value)) {
    oldValue = toRaw(oldValue)
    value = toRaw(value)
  }
  if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
    if (isOldValueReadonly) {
      return false
    } else {
      oldValue.value = value
      return true
    }
  }
} else {
  // in shallow mode, objects are set as-is regardless of reactive or not
}
```

接下来是判断目标`key`是否存在于`target`上，以区分无此属性时新增的情况和修改原有属性的情况：

```typescript
const hadKey =
  isArray(target) && isIntegerKey(key)
    ? Number(key) < target.length
    : hasOwn(target, key)
```

因为在修改属性时常常涉及到多种情况，导致属性更名/删除/新增等情况，需要在`trigger`时进行分别的处理，因此vue定义了如下几种`trigger`类型：

```typescript
export enum TriggerOpTypes {
  SET = 'set',
  ADD = 'add',
  DELETE = 'delete',
  CLEAR = 'clear',
}
```

最后就是根据情况来调用`trigger`，需要注意若`target`对象为响应式对象的原型链上的对象（因为原型链上的对象若有proxy handler也会被触发）则不应`trigger`，因此需要对比`target`和`toRaw`得到的原始对象：

```typescript
const result = Reflect.set(target, key, value, receiver)
  // don't trigger if target is something up in the prototype chain of original
if (target === toRaw(receiver)) {
  if (!hadKey) {
    trigger(target, TriggerOpTypes.ADD, key, value)
  } else if (hasChanged(value, oldValue)) {
    trigger(target, TriggerOpTypes.SET, key, value, oldValue)
  }
}
return result
```

对于普通的对象来说（非vue定义的collection类型的对象），除了`set`还有`deleteProperty`的数据修改方式需要处理，但它相对更为简单：

```typescript
deleteProperty(target: object, key: string | symbol): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = (target as any)[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
  }
  return result
}
```

只需注意将新值设置为`undefined`和传入对应的操作类型即可。

#### trigger实现

首先查看`trigger`函数的签名：

```typescript
export function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
  oldTarget?: Map<unknown, unknown> | Set<unknown>,
) {...}
```

注意到除了`target`和`type`参数外都是可选项，这是因为修改属性时，可能存在属性名、属性值等情况，需要我们根据`type`来判断具体的情况。

接下来逐步看函数的具体实现代码。

先取对应对象的依赖桶，若不存在说明未被追踪，直接返回即可：

```typescript
const depsMap = targetMap.get(target)
if (!depsMap) {
  // never been tracked
  return
}
```

首先定义了一个依赖数组，其中内容将会是后续真正执行的副作用函数，然后进入判断来将相关依赖加入到数组中。第一个`if`处理`type`为`clear`的情况，此时代表是`collection`类型的对象(如`Set`)内容清空，涉及到所有的属性，需要触发所有的相关副作用，因此直接复制整个对象的副作用依赖桶。而对于`else if`块，判断元素为数组，若修改了`length`属性，则会导致数组大小发生变化，我们只需对`length`变小的情况进行处理，因为此时会导致已有元素被删除，所以遍历所有的属性，找出此时被删除的属性和`length`自身加入到目的执行的依赖数组。

```typescript
let deps: (Dep | undefined)[] = []
if (type === TriggerOpTypes.CLEAR) {
  // collection being cleared
  // trigger all effects for target
  deps = [...depsMap.values()]
} else if (key === 'length' && isArray(target)) {
  const newLength = Number(newValue)
  depsMap.forEach((dep, key) => {
    if (key === 'length' || (!isSymbol(key) && key >= newLength)) {
      deps.push(dep)
    }
  })
} else {
  ...
}
```

最后一个`else`块源码如下：

```typescript
// schedule runs for SET | ADD | DELETE

if (key !== void 0) {
  // 将目标属性的依赖加入执行列表
  deps.push(depsMap.get(key))
}

// also run for iteration key on ADD | DELETE | Map.SET
switch (type) {
  case TriggerOpTypes.ADD:
    // type为新增属性的情况
    if (!isArray(target)) {
      // 若不为数组，则触发ITERATE_KEY对应副作用
      deps.push(depsMap.get(ITERATE_KEY))
      if (isMap(target)) {
        // map有专门的MAP_KEY_ITERATE_KEY迭代标识
        deps.push(depsMap.get(MAP_KEY_ITERATE_KEY))
      }
    } else if (isIntegerKey(key)) {
      // isIntegerKey用于判断key是否符合数组的索引规范
      // 若符合则需要触发length的副作用
      // new index added to array -> length changes
      deps.push(depsMap.get('length'))
    }
    break
  case TriggerOpTypes.DELETE:
    // type为删除的情况，都应触发对应的迭代副作用
    // 数组的删除通过length进行处理，因此这里的情况不需要处理
    if (!isArray(target)) {
      deps.push(depsMap.get(ITERATE_KEY))
      if (isMap(target)) {
        deps.push(depsMap.get(MAP_KEY_ITERATE_KEY))
      }
    }
    break
  case TriggerOpTypes.SET:
    // 普通修改仅对map进行特殊处理
    if (isMap(target)) {
      deps.push(depsMap.get(ITERATE_KEY))
    }
    break
}
```

具体的细节已经写在注释当中，此处主要处理不同情况下对属性的修改导致影响`ownKeys`的迭代，需要触发对应对象的迭代副作用。

最后即是具体调用`triggerEffects`函数，进行具体的副作用函数调用部分：

```typescript
pauseScheduling()
for (const dep of deps) {
  if (dep) {
    triggerEffects(
      dep,
      DirtyLevels.Dirty,
      __DEV__
        ? {
            target,
            type,
            key,
            newValue,
            oldValue,
            oldTarget,
          }
        : void 0,
    )
  }
}
resetScheduling()
```

此处便是遍历`deps`数组，依次调用`triggerEffects`来进入实际的副作用执行阶段。

> 可以注意到，`pauseScheduling()`和`resetScheduling()`在此前的`track`中也出现过，事实上，它们俩始终应该成对出现，用于控制调度器的运行与暂停。调度器是`effect`提供的一个能力，它让我们能够传入一个函数，来手动控制具体副作用函数的执行方式，当存在调度器时，将不会直接调用目的副作用函数，而是改为调用对应的调度器，具体的副作用执行方式由调度器自行决定。而`pauseScheduling()`会暂停调度器的执行，直到`resetScheduling()`执行时才可能会恢复执行。关于调度器的实际执行细节同样在`effect`详解。

`triggerEffects`的函数签名如下：

```typescript
export function triggerEffects(
  dep: Dep,
  dirtyLevel: DirtyLevels,
  debuggerEventExtraInfo?: DebuggerEventExtraInfo,
) {...}
``` 

参数里有一个陌生的参数`dirtyLevel`，它代表着脏值检测的一个标志，用于判断数据是否发生变化与是否需要触发副作用等。具体将在`effect`进行解析。

```typescript
pauseScheduling()
for (const effect of dep.keys()) {
  if (
    effect._dirtyLevel < dirtyLevel &&
    dep.get(effect) === effect._trackId
  ) {...}
}
scheduleEffects(dep)
resetScheduling()
```

if块内的部分如下：

```typescript
const lastDirtyLevel = effect._dirtyLevel
effect._dirtyLevel = dirtyLevel
if (lastDirtyLevel === DirtyLevels.NotDirty) {
  effect._shouldSchedule = true
  if (__DEV__) {
    effect.onTrigger?.(extend({ effect }, debuggerEventExtraInfo))
  }
  effect.trigger()
}
```

此处会调用副作用的`trigger()`方法，若处于开发环境，还会调用对应的`onTrigger`钩子。事实上，通过`effect()`函数创建的副作用函数，其`trigger()`方法并不存在，其真正的触发方式是通过`scheduleEffects(dep)`方法将依赖全部加入调度器栈，并在最后通过`resetScheduling()`来依次触发调度器栈中的函数。

在`effect()`函数中，创建副作用函数的部分如下：

```typescript
const _effect = new ReactiveEffect(fn, NOOP, () => {
  if (_effect.dirty) {
    _effect.run()
  }
})
```

第一个参数是我们传入的副作用函数，第二个参数则是`trigger()`方法，第三个参数是调度器函数。我们可以看到，其传入的`trigger()`为空，而使用了一个调度器来触发副作用函数的`run()`方法。在后续我们会了解到，真正调用副作用的其实是这个`run()`方法。所以实际上`triggerEffects()`并不会直接触发副作用，而是将它们加入调度器栈中，并在递归的最后再来依次触发。

#### collection类型对象的代理

此部分与[trigger: collection类型对象的代理](#collection类型对象的代理)部分非常相似，或者说只是覆写的对象方法不同。我们以最常用的修改方法`Map.set()`为例，我们覆写了此方法：

```typescript
function set(this: MapTypes, key: unknown, value: unknown) {
  value = toRaw(value)
  const target = toRaw(this)
  const { has, get } = getProto(target)

  let hadKey = has.call(target, key)
  if (!hadKey) {
    key = toRaw(key)
    hadKey = has.call(target, key)
  } else if (__DEV__) {
    checkIdentityKeys(target, has, key)
  }

  const oldValue = get.call(target, key)
  target.set(key, value)
  if (!hadKey) {
    trigger(target, TriggerOpTypes.ADD, key, value)
  } else if (hasChanged(value, oldValue)) {
    trigger(target, TriggerOpTypes.SET, key, value, oldValue)
  }
  return this
}
```

流程非常简单，需要注意的是通过是否已经含有对应`key`值来执行不同的`trigger`类型：

```typescript
if (!hadKey) {
  trigger(target, TriggerOpTypes.ADD, key, value)
} else if (hasChanged(value, oldValue)) {
  trigger(target, TriggerOpTypes.SET, key, value, oldValue)
}
```


### effect

在前文里，我们一直在说`effect`，它用来创建/注册一个副作用函数，使其函数内部的响应式变量能够与副作用函数建立联系。实际上，vue并不提供（对外暴露）一个名为`effect()`的函数，它更多的是在vue工程内作相应式的测试使用（我们可以发现在源码中它的用法都是在以`.spec.ts`为结尾的文件）。真正使用的到的是一个名为`ReactiveEffect`的类，它是一个充分实现了响应式副作用函数能力的类型，`effect()`函数本身也不过是对于`new ReactiveEffect()`的一个封装。因此在下文中，我们将主要分析`ReactiveEffect`类型。

#### ReactiveEffect

首先看构造函数：

```typescript
constructor(
  public fn: () => T,
  public trigger: () => void,
  public scheduler?: EffectScheduler,
  scope?: EffectScope,
) {
  recordEffectScope(this, scope)
}
```

第一个参数是目标副作用函数，第二个参数是副作用函数的`trigger`（其正是上文中提到的`effect.trigger()`），第三个参数是副作用函数的调度器`scheduler`（它决定了如何调用副作用函数）。第四个参数是副作用函数的作用域，每个副作用函数都依附于一个作用域，以提供一个对副作用的控制能力，不传此参数会提供一个默认的当前作用域。

> vue组件拥有setup的能力，我们可以在其中声明任意的响应式变量和副作用，而它们都会自动地与组件的生命周期相绑定，自动地创建与删除。手动收集这些依赖是很麻烦的，而通过`EffectScope`给每个组件一个副作用作用域的方法，可以很方便地进行统一的副作用管理，vue也为此专门抽离了一个`effectScope()`的API出来。

在构造函数中调用了`recordEffectScope`函数，它的实现很简单：

```typescript
export function recordEffectScope(
  effect: ReactiveEffect,
  scope: EffectScope | undefined = activeEffectScope,
) {
  if (scope && scope.active) {
    scope.effects.push(effect)
  }
}
```

每个`scope`都会储存属于自己的`effects`数组，只需判断若当前`scope`处于活跃状态即将其加入到其副作用函数列表中。

现在我们暂且把`effect()`的实现简单地当作是返回了一个通过`new ReactiveEffect()`创建的副作用函数，其实现为：

```typescript
export function effect<T = any>(
  fn: () => T,
  options?: ReactiveEffectOptions,
): ReactiveEffectRunner {
  // ...一些对fn的处理...

  const _effect = new ReactiveEffect(fn, NOOP, () => {
    if (_effect.dirty) {
      _effect.run()
    }
  })
  // ...一些对option的处理...

  const runner = _effect.run.bind(_effect) as ReactiveEffectRunner
  runner.effect = _effect
  return runner
}
```

根据`ReactiveEffect`的构造函数参数可以知道，此处需要注意的点是第三个调度器参数，它表示了仅当`dirty`属性为`true`时才会执行副作用函数。`effect.run()`就是副作用函数对象的执行方法，我们先来看一下内部的实现：

```typescript
run() {
  this._dirtyLevel = DirtyLevels.NotDirty
  if (!this.active) {
    return this.fn()
  }
  let lastShouldTrack = shouldTrack
  let lastEffect = activeEffect
  try {
    shouldTrack = true
    activeEffect = this
    this._runnings++
    preCleanupEffect(this)
    return this.fn()
  } finally {
    postCleanupEffect(this)
    this._runnings--
    activeEffect = lastEffect
    shouldTrack = lastShouldTrack
  }
}
```

主要执行逻辑在于`try...finally..`部分，在执行前先修改`shouldTrack`，表示此时运行进行依赖追踪，同时将`activeEffect`赋值为当前副作用函数对象，这与前面的`track()`相对应：

```typescript
// track中此条件成立才会进入依赖追踪
if (shouldTrack && activeEffect) {
  ...
}
```

同时，它使用了一个`_runnings`属性来避免循环依赖，在副作用函数执行前进行自增，在执行完成后进行自减。因此，当`_runnings`的值不为0时，说明当前正在循环执行同一个副作用函数，在实际调用`effect.run()`的地方（事实上是在`resetScheduling()`中）会通过`_runnings`进行判断，不为0时将不会执行以避免出现循环依赖的问题。

#### 依赖清除与_trackId的作用

我们在之前谈到，因为条件改变等原因导致副作用函数的依赖项发生变化，而为了避免依赖性变化后副作用函数残留无关依赖，我们在执行副作用函数前回清除其所有的依赖并在执行时重新建立新的相关依赖。

这并不准确，在vue中，实际上存在两个依赖清除的步骤，我们假设目标副作用函数为`fn`：

1. 在`fn`执行前，调用`preCleanupEffect()`进行预清除
2. 在`fn`执行后，调用`postCleanupEffect()`进行实际的依赖清除

由于实际的清除是在副作用函数执行之后，为了找出需要清除的那部分依赖，引入了`_trackId`来作为依赖的相关性标识。

我们先来看`preCleanupEffect()`函数：

```typescript
function preCleanupEffect(effect: ReactiveEffect) {
  effect._trackId++
  effect._depsLength = 0
}
```

此处`_trackId`进行自增且仅能自增，保证每次执行都有一个新的唯一的id，与不同的执行时期进行区分（例如第一次执行时与第二次执行时副作用函数引用的某全局量发生改变导致实际执行情况不同）。

接下来是实际清除依赖的函数`postCleanupEffect()`：

```typescript
function postCleanupEffect(effect: ReactiveEffect) {
  if (effect.deps && effect.deps.length > effect._depsLength) {
    for (let i = effect._depsLength; i < effect.deps.length; i++) {
      cleanupDepEffect(effect.deps[i], effect)
    }
    effect.deps.length = effect._depsLength
  }
}
```

此处当副作用函数的实际依赖长度`effect.deps.length`超过记录的应有依赖长度`effect._depsLength`时，表明有不相关依赖残留，因此需要遍历依赖数组进行清除操作。

清理依赖的具体实现在`cleanupDepEffect()`中：

```typescript
function cleanupDepEffect(dep: Dep, effect: ReactiveEffect) {
  const trackId = dep.get(effect)
  if (trackId !== undefined && effect._trackId !== trackId) {
    dep.delete(effect)
    if (dep.size === 0) {
      dep.cleanup()
    }
  }
}
```

这里进行了一个判断，只有当副作用函数的`_trackId`与其在依赖中记录的不同时才删除此依赖，为什么要如此呢？

根据`track`和`effect`中核心函数的实现，思考如下流程：

1. 副作用函数执行前，`_trackId`自增1
2. 副作用函数执行时，触发`trackEffect`函数，若此时`_trackId`与依赖`dep`中原先记录的不同，则更新依赖中记录的id并建立依赖关系
3. 副作用函数执行后，遍历依赖，若发现其`_trackId`仍与记录的不同，则说明在函数执行过程中没有重新建立依赖，表明此时副作用函数与此依赖不相关，即可清除

由此，即可实现清除与副作用函数不相关依赖的能力。

同样，在`trigger`的执行中，也会判断`_trackId`与记录的是否相同，以此来避免执行不相关的副作用函数。

#### scheduler的统一调度

在前面`trigger`和`track`部分中我们都有遇到`pauseScheduling()`、`resetScheduling()`和`resetScheduling()`函数，它们专门用于控制和避免调度器运行过程中产生的意外情况，实际上也保证了调度执行的原子性。试想如下的一个情况：

```typescript
const a = ref<number[]>([]);

effect(() => {
  console.log('a', `value: ${JSON.stringify(a.value)}`);
  a.value.splice(0);
});

a.value.push(1);
```

在`vue3.4.0`以前的版本，我们会发现其输出为：

```typescript
a value: []
a value: [1]
a value: [null]
```

这是令人迷惑的一个情况，因为我们期待的输出是只有前两行，第3行出现`[null]`是意料之外的。

出现这种问题，实际上是因为调度器的执行过程中触发了另外的副作用。接下来进行逐步的分析：

1. log数组，建立对数组的副作用依赖。执行`splice`，数组依然为[]。
2. 执行`push`，其会产生两个操作:
  a. 设置对应的索引`key(0)`对应值为1 
  b. 更新`length`为1

我们可以发现，在`push`方法设置索引时就会触发代理对象的`set`拦截器，进而触发副作用函数执行，导致`splice`执行。`splice`执行会使数组长度变回0且清除第一个元素内容，在其执行完成后回到`push`的第二步，由于`length`再次被从0改为1，因此再次触发副作用函数，此时打印出的数组即为`[null]`。

要想避免这种情况，我们需要保证`push`操作的原子化，避免其在执行中途被其他调度器插队执行，其实现也比较简单，我们先看看几个主要方法的实现：

```typescript
export let pauseScheduleStack = 0

export function pauseScheduling() {
  pauseScheduleStack++
}

export function resetScheduling() {
  pauseScheduleStack--
  while (!pauseScheduleStack && queueEffectSchedulers.length) {
    queueEffectSchedulers.shift()!()
  }
}
```

通过设置一个`pauseScheduleStack`来记录scheduler的时机，在每个需要保证原子化的部分首先调用`pauseScheduling()`，在执行完成后调用`resetScheduling()`，其可以保证在目标部分执行完成前绝对不会执行调度器（即pauseScheduleStack为0）。而在执行完成后，`resetScheduling()`仅在`pauseScheduleStack`值为0时才依次执行调度器。我们可以列出一个类似结构：

```typescript
pauseScheduling()
  // ...一些操作
  pauseScheduling()
    // ...一些操作
    pauseScheduling()
      // ...一些操作
      scheduleEffects(dep)
    resetScheduling()
    // ...一些操作
  resetScheduling()
  // ...一些操作
resetScheduling()
```

我们可以进行不断的嵌套，并在最终执行时保证将目标调度器通过`scheduleEffects(dep)`推入执行栈，这样可以让其在递归退出到最外层执行栈时可以依次触发目标调度器。`scheduleEffects()`实现如下：

```typescript
export function scheduleEffects(dep: Dep) {
  for (const effect of dep.keys()) {
    if (
      effect.scheduler &&
      effect._shouldSchedule &&
      (!effect._runnings || effect.allowRecurse) &&
      dep.get(effect) === effect._trackId
    ) {
      effect._shouldSchedule = false
      queueEffectSchedulers.push(effect.scheduler)
    }
  }
}
```

其中，`effect._shouldSchedule`是在前文的`triggerEffects()`里被标注为`true`的。

现在我们返回最初的例子，当数组的`push()`被调用时，会进入到我们劫持的`push`方法：

```typescript
(['push', 'pop', 'shift', 'unshift', 'splice'] as const).forEach(key => {
  instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
    pauseTracking()
    pauseScheduling() // 暂停调度
    const res = (toRaw(this) as any)[key].apply(this, args)
    resetScheduling() // 恢复调度
    resetTracking()
    return res
  }
})
```

在调用数组真正的`push()`方法前，`pauseScheduling`值变为1，然后调用方法，使其触发`key`和`length`的副作用，但在这些副作用执行过程中无论何时`pauseScheduling`都不会小于1，直到`push`完整执行后，才调用在其过程中推入调度器栈的副作用函数。而在两步执行过程中分别触发副作用，然而在第二步时由于没有了`splice()`对`length`的干扰，导致`length`值并没有发生变化，因此实际最终只会触发一次调度器，最终得到期望结果。

> `push()`方法虽然设置索引值与设置length是依次进行，但实际上原生数组对象在索引设置完成后`length`就会自动更新，所以第二步更新`length`时其已经变为实际长度了，这导致其并不会触发第二次length变化的副作用。

> `push()`是一个通用的方法，它不仅可以用于原生数组，还可以用于具备`length`属性的类数组对象，由于类数组对象在索引更新后并不会自动更新`length`，因此此时便是其第二步设置length发挥作用的地方。

需要注意的是，`scheduler`是一个供用户自定义的调度器，我们可以选择在其中真正执行对应的副作用函数，当然也可以选择不执行。有时我们仅仅想要通过`scheduler`来执行一些副作用函数以外的操作，只是需要通过`effect()`来实现对其依赖的监听，这其实也是`vue`中`watch`的原理。

#### dirty

在`ReactiveEffect`类中定义有一个`_dirtyLevel`属性：

```typescript
_dirtyLevel = DirtyLevels.Dirty
```

其初始值为`DirtyLevels.Dirty`，而`DirtyLevels`的枚举如下：

```typescript
export enum DirtyLevels {
  NotDirty = 0,
  MaybeDirty = 1,
  Dirty = 2,
}
```

我们首先知道，在`ReactiveEffect`的`run()`方法中，第一行便是：

```typescript
this._dirtyLevel = DirtyLevels.NotDirty;
```

在前文的`triggerEffects()`中有一个相关部分：

```typescript
if (
  effect._dirtyLevel < dirtyLevel &&
  dep.get(effect) === effect._trackId
) {
  const lastDirtyLevel = effect._dirtyLevel
  effect._dirtyLevel = dirtyLevel
  if (lastDirtyLevel === DirtyLevels.NotDirty) {
    effect._shouldSchedule = true
    // ...调用effect.trigger()
    // ...
  }
  // ...
}
```

此处的`dirtyLevel`变量在一般情况下的值都为`DirtyLevels.Dirty`，意味着仅当`effect._dirtyLevel`不为`Dirty`时才会进入下文，并且其会被赋值为`Dirty`。接下来，若此前的`_dirtyLevel`为`NoDirty`，则会将`_shouldSchedule`赋值为true，后续在遍历调度器时仅当`_shouldSchedule`为true时才会执行。

对比`effect.run()`和`triggerEffects()`中的流程，我们可以大致有一个基本判断：

当副作用被触发，但副作用函数还未实际运行时，`_dirtyLevel`变为脏的，当副作用函数实际执行后则`_dirtyLevel`就不脏了。并且，仅当原来不脏的时候才会执行调度器（副作用函数的实际执行者）。

这种设计可以避免同一个副作用函数在某些情况的不必要重复执行（在渲染器中可以用来避免同一个副作用函数导致的反复渲染，详见[连续修改两个响应式变量会重新渲染几次？](#连续修改两个响应式变量会重新渲染几次)），它的出现另一个作用是用于帮助Vue3.4版本以后的**计算属性**避免不必要的副作用重新触发。我们将在下文计算属性部分进行详解。

## 响应式API的实现

在前面我们已经基本分析了`trigger`、`track`和`effect`的原理，实际上vue的响应式API基本上就是这3个基础的组合使用，接下来我们将分析几个常用响应式API的实现细节。

### reactive

`reactive`是vue3最为基础的响应式API，它能够传入一个对象并返回对象的响应式代理。

其代码如下：

```typescript
export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
export function reactive(target: object) {
  // if trying to observe a readonly proxy, return the readonly version.
  if (isReadonly(target)) {
    return target
  }
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap,
  )
}
```

其通过`createReactiveObject()`函数创建代理对象：

```typescript
function createReactiveObject(
  target: Target,
  isReadonly: boolean,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>,
  proxyMap: WeakMap<Target, any>,
) {
  ...
}
```

传入的参数`proxyMap`（在`reactive()`调用时传入的`reactiveMap`）是`reactive.ts`文件维护的一个全局依赖桶，声明如下：

```typescript
export const reactiveMap = new WeakMap<Target, any>()
```

`createReactiveObject()`方法的代码很简单，如下：

```typescript
if (!isObject(target)) {
    if (__DEV__) {
      console.warn(`value cannot be made reactive: ${String(target)}`)
    }
    return target
  }
  // target is already a Proxy, return it.
  // exception: calling readonly() on a reactive object
  if (
    target[ReactiveFlags.RAW] &&
    !(isReadonly && target[ReactiveFlags.IS_REACTIVE])
  ) {
    return target
  }
  //上面处理target不为对象、target为响应式对象的case

  // target already has corresponding Proxy
  const existingProxy = proxyMap.get(target)
  if (existingProxy) {
    return existingProxy
  }
  // only specific value types can be observed.
  const targetType = getTargetType(target)
  if (targetType === TargetType.INVALID) {
    return target
  }
  const proxy = new Proxy(
    target,
    targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers,
  )
  proxyMap.set(target, proxy)
  return proxy
```

首先是处理target不为对象、target为响应式对象的情况，然后判断是否已存在，若不存在则创建新代理，否则直接返回已有代理。

`reacitve()`实际上在前文的`track()`部分已经做了分析，这里只看看总体流程。

### ref

`Proxy`实际上只支持对对象的代理，而对于js里同样常用的非对象类型数据则无能为例，这也导致了`reactive()`无法代理原始值类型，因此，vue创造了`ref()`来解决这个问题。

> 原始值指的是 `Boolean、Number、 BigInt、String、Symbol、undefined` 和 `null` 等类型的值。在JavaScript中，原始值是按值传递的，而非按引用传递。这意味着，如果一个函数接收原始值作为参数，那么形参与实参之间没有引用关系，它们是两个完全独立的值，对形参的修改不会影响实参。另外，JavaScript 中的Proxy无法提供对原始值的代理，因此想要将原始值变成响应式数据，就必须对其做一层包裹，也就是我们接下来要介绍的ref。 --《Vue设计与实现》

`ref`的声明如下：

```typescript
export function ref<T>(value: T): Ref<UnwrapRef<T>>
export function ref<T = any>(): Ref<T | undefined>
export function ref(value?: unknown) {
  return createRef(value, false)
}
```

通过`createRef()`来创建代理对象：

```typescript
function createRef(rawValue: unknown, shallow: boolean) {
  if (isRef(rawValue)) {
    return rawValue
  }
  return new RefImpl(rawValue, shallow)
}
```

先判断是否已经为`Ref`类型，若是则直接返回，否则创建一个`RefImpl`对象。

```typescript
class RefImpl<T> {
  private _value: T
  private _rawValue: T

  public dep?: Dep = undefined
  public readonly __v_isRef = true

  constructor(
    value: T,
    public readonly __v_isShallow: boolean,
  ) {
    this._rawValue = __v_isShallow ? value : toRaw(value)
    this._value = __v_isShallow ? value : toReactive(value)
  }
  // ...
}
```

在`RefImpl`类的构造函数里，对`__v_isShallow`、`_rawValue`和`_value`属性进行了初始化，其分别代表是否浅代理、原始值、代理值。

注意到，`_value`属性通过`toReactive()`进行赋值，其实现如下：

```typescript
export const toReactive = <T extends unknown>(value: T): T =>
  isObject(value) ? reactive(value) : value
```

若不为对象则直接返回其值，否则返回一个`reactive()`代理。

我们知道通过`ref()`创建的代理对象通过`.value`属性来进行访问和修改值，实际上，`RefImpl`类便是构造了`value`属性的访问器来劫持其读取与修改过程，实现对原始值的响应能力。而此处得到的`_value`属性便是`value`的基础，当访问`value`时，会对其建立响应式依赖，并返回`_value`的值。

```typescript
class RefImpl<T> {
  // ...
  get value() {
    trackRefValue(this)
    return this._value
  }
  // ...
}
```

建立响应式依赖的部分和`reactive()`的`get`代理部分十分相似：

```typescript
export function trackRefValue(ref: RefBase<any>) {
  if (shouldTrack && activeEffect) {
    ref = toRaw(ref)
    trackEffect(
      activeEffect,
      ref.dep ||
        (ref.dep = createDep(
          () => (ref.dep = undefined),
          ref instanceof ComputedRefImpl ? ref : undefined,
        )),
      __DEV__
        ? {
            target: ref,
            type: TrackOpTypes.GET,
            key: 'value',
          }
        : void 0,
    )
  }
}
```

需要注意的是，`ref`的副作用依赖并没有一个全局的依赖桶，它是通过`ref.dep`属性来储存的，而其类型为对象的值的下层依赖由`reactive()`维护。实际上，我们可以认为`Ref`类型只自己维护了一个`.value`属性的依赖列表。此外，调用`trackEffect()`时若无依赖列表，则通过`createDep`创建，其第二个参数会为创建的`dep`增加一个`computed`属性，代表其依赖对应的计算属性。

接下来看`value`属性的`set`：

```typescript
set value(newVal) {
  const useDirectValue =
    this.__v_isShallow || isShallow(newVal) || isReadonly(newVal)
  newVal = useDirectValue ? newVal : toRaw(newVal)
  if (hasChanged(newVal, this._rawValue)) {
    this._rawValue = newVal
    this._value = useDirectValue ? newVal : toReactive(newVal)
    triggerRefValue(this, DirtyLevels.Dirty, newVal)
  }
}
```

新值若相对旧值发生变化，则重新调用`toReactive()`为其赋值，然后通过`triggerRefValue()`来触发副作用。而`triggerRefValue()`实际也是`triggerEffects()`的封装：

```typescript
export function triggerRefValue(
  ref: RefBase<any>,
  dirtyLevel: DirtyLevels = DirtyLevels.Dirty,
  newVal?: any,
) {
  ref = toRaw(ref)
  const dep = ref.dep
  if (dep) {
    triggerEffects(
      dep,
      dirtyLevel,
      __DEV__
        ? {
            target: ref,
            type: TriggerOpTypes.SET,
            key: 'value',
            newValue: newVal,
          }
        : void 0,
    )
  }
}
```

### computed

计算属性相对`ref`和`reactive`比较特殊，它允许传入一个副作用函数，并在其副作用的依赖发生变化时重新执行副作用，并将副作用计算的结果值返回作为其计算属性值使用。同时，它的值与其他响应式对象一样可以触发其他副作用，还可以缓存上一次计算值，避免不必要的副作用（在vue3.4中更新）。

我们从`computed()`入口函数开始：

```typescript
export function computed<T>(
  getterOrOptions: ComputedGetter<T> | WritableComputedOptions<T>,
  debugOptions?: DebuggerOptions,
  isSSR = false,
) {
  let getter: ComputedGetter<T>
  let setter: ComputedSetter<T>

  const onlyGetter = isFunction(getterOrOptions)
  if (onlyGetter) {
    getter = getterOrOptions
    setter = __DEV__
      ? () => {
          console.warn('Write operation failed: computed value is readonly')
        }
      : NOOP
  } else {
    getter = getterOrOptions.get
    setter = getterOrOptions.set
  }

  const cRef = new ComputedRefImpl(getter, setter, onlyGetter || !setter, isSSR)

  if (__DEV__ && debugOptions && !isSSR) {
    cRef.effect.onTrack = debugOptions.onTrack
    cRef.effect.onTrigger = debugOptions.onTrigger
  }

  return cRef as any
}
```

先判断传入的参数是否为函数，若是则将`getter`赋值为传入函数，否则获取其传入的`setter`和`getter`。然后将两者传入`ComputedRefImpl`的构造函数，并将其作为计算属性对象返回。

此处可以看出计算属性的核心实现应与`ref`类似，通过一个对象来代理`value`属性的读写操作来实现响应式。先来看`ComputedRefImpl`的构造函数：

```typescript
export class ComputedRefImpl<T> {
  public dep?: Dep = undefined
  private _value!: T
  public readonly effect: ReactiveEffect<T>

  public readonly __v_isRef = true
  public readonly [ReactiveFlags.IS_READONLY]: boolean = false
  public _cacheable: boolean

  constructor(
    getter: ComputedGetter<T>,
    private readonly _setter: ComputedSetter<T>,
    isReadonly: boolean,
    isSSR: boolean,
  ) {
    this.effect = new ReactiveEffect(
      () => getter(this._value),
      () => triggerRefValue(this, DirtyLevels.MaybeDirty),
      () => this.dep && scheduleEffects(this.dep),
    )
    this.effect.computed = this
    this.effect.active = this._cacheable = !isSSR
    this[ReactiveFlags.IS_READONLY] = isReadonly
  }
  //... 
}
```

其核心在于创建了一个`ReactiveEffect`副作用函数并将其赋值给`this.effect`。我们知道，`ReactiveEffect`构造函数的3个参数分别为副作用函数、`trigger`函数，调度器函数。可以注意到，在此前的用法中一直没有传入`trigger`参数，此处却传入了（事实上，`ReactiveEffect`的`trigger`参数的主要作用便是用于计算属性的处理，它先于调度器执行），并且在其中调用了`ref`中的`triggerRefValue()`，其`dirtyLevel`传入了`DirtyLevels.MaybeDirty`。

计算属性可以当作为副作用一个中介，我们传入的`getter`是一个计算副作用，是中间态，而我们实际读取计算属性（读取了计算属性的`.value`）的副作用应该才是响应式依赖改变需要触发的副作用。我们猜测计算属性应遵循如下流程：

1. 计算属性的依赖发生改变

2. 若存在依赖计算属性的副作用，**运行计算副作用（getter），检验值是否发生变化**。否则什么也不做

3. 发生变化，则触发真正的副作用函数（即读取了计算属性的那个副作用函数），否则什么也不做

extra. 当读取计算属性值时，若其依赖值没有发生改变，则不重新计算，使用上一次的缓存值，否则重新计算并返回新值

可以看出，计算属性会有两次副作用执行的判断，而计算副作用和最终副作用的触发都取决于是否存在最终副作用，也就是是否有对计算属性`.value`的`get`操作。因此我们可以通过`value`属性的访问器函数来进行操作：

```typescript
export class ComputedRefImpl<T> {
  get value() {
    // the computed ref may get wrapped by other proxies e.g. readonly() #3376
    const self = toRaw(this)
    if (!self._cacheable || self.effect.dirty) {
      if (hasChanged(self._value, (self._value = self.effect.run()!))) {
        triggerRefValue(self, DirtyLevels.Dirty)
      }
    }
    trackRefValue(self)
    if (self.effect._dirtyLevel >= DirtyLevels.MaybeDirty) {
      triggerRefValue(self, DirtyLevels.MaybeDirty)
    }
    return self._value
  }
}
```

注意到，这里使用到了`effect.dirty`和`effect._dirtyLevel`属性。`computed`是如何得知其依赖的响应式属性是否有发生变化就是通过此处的`dirty`实现，我们可以设计一个简单的流程（注意，这里只是一个推测的基础流程）：

1. 初始`dirty`为`true`，第一次读取时直接执行getter

2. getter执行后`dirty`设置为`false`

3. 当计算属性的依赖发生变化时（即getter副作用被触发时），通过`ReactiveEffect`的调度器参数，首先将`dirty`设置为`true`，并且此时并不直接执行`getter`，而是尝试通过`trigger`来触发读取计算属性的那个副作用函数，并且在计算属性的`get`代理中重新计算结果。

在前文的`effect`部分已经给出了关于`_dirtyLevel`的介绍，这里则给出`dirty`属性的访问器：

```typescript
public get dirty() {
  if (this._dirtyLevel === DirtyLevels.MaybeDirty) {
    pauseTracking()
    for (let i = 0; i < this._depsLength; i++) {
      const dep = this.deps[i]
      if (dep.computed) {
        triggerComputed(dep.computed)
        if (this._dirtyLevel >= DirtyLevels.Dirty) {
          break
        }
      }
    }
    if (this._dirtyLevel < DirtyLevels.Dirty) {
      this._dirtyLevel = DirtyLevels.NotDirty
    }
    resetTracking()
  }
  return this._dirtyLevel >= DirtyLevels.Dirty
}
```

分析整体流程，首先是判断副作用函数的`_dirtyLevel`，当其为`MaybeDirty`才会进入执行（代表计算属性依赖的响应式数据发生了变化），否则直接返回其`_dirtyLevel`是否大于等于`Dirty`。

在if块中，会遍历取得每一个依赖项。可以注意到，`this`指向的副作用函数是计算属性的`getter`，那么该副作用函数的依赖理便是`getter`的依赖，暨计算属性依赖的每一个响应式数据。对于每一个遍历到的依赖，我们尝试获取到其中的计算属性（如果该依赖是一个计算属性），并触发其计算：

```typescript
function triggerComputed(computed: ComputedRefImpl<any>) {
  return computed.value
}
```

在此前`pauseTracking()`的主要原因便是避免此处的`get`操作导致外层读取计算属性的副作用绑定到了内层嵌套的计算属性上。

此外，为依赖绑定计算属性是在`trackRefValue中做的`:

```typescript
export const createDep = (
  cleanup: () => void,
  computed?: ComputedRefImpl<any>,
): Dep => {
  const dep = new Map() as Dep
  dep.cleanup = cleanup
  dep.computed = computed
  return dep
}

export function trackRefValue(ref: RefBase<any>) {
  if (shouldTrack && activeEffect) {
    ref = toRaw(ref)
    trackEffect(
      activeEffect,
      ref.dep ||
        (ref.dep = createDep(
          () => (ref.dep = undefined),
          ref instanceof ComputedRefImpl ? ref : undefined,
        )),
      __DEV__
        ? {
            target: ref,
            type: TrackOpTypes.GET,
            key: 'value',
          }
        : void 0,
    )
  }
}
```

我们回到计算属性的`get value()`代理，在判断了`dirty`后若为脏，则会执行`getter`来得到新的计算值，并判断与原值是否相等，不相等则会触发依赖此计算属性的副作用：

```typescript
if (!self._cacheable || self.effect.dirty) {
  if (hasChanged(self._value, (self._value = self.effect.run()!))) {
    triggerRefValue(self, DirtyLevels.Dirty)
  }
}
```

然后会使用`trackRefValue`将当前计算属性的`value`属性与读取该`value`的副作用函数建立依赖，然后若`getter`的`_dirtyLevel`大于等于`MaybeDirty`则触发建立的依赖副作用函数。

```typescript
trackRefValue(self)
if (self.effect._dirtyLevel >= DirtyLevels.MaybeDirty) {
  triggerRefValue(self, DirtyLevels.MaybeDirty)
}
return self._value
```

> 之所以需要区分`Dirty`和`MaybeDirty`是因为计算属性可能存在的两种修改状态，一是在计算属性依赖的响应式数据发生改变时，我们理应认为数据脏了。但是，依赖数据的更改并不一定代表最终计算结果会更改，我们可以认为只有最终的数据发生更改了才是真正的脏值，而依赖改变则作为一个中间态`MaybeDirty`来提醒此时数据只是可能为脏。

这里进行了很多的`_dirtyLevel`判断，看起来很难理解，因此我们回到`effect`的创建处，从这里入手：

```typescript
this.effect = new ReactiveEffect(
  () => getter(this._value),
  () => triggerRefValue(this, DirtyLevels.MaybeDirty),
  () => this.dep && scheduleEffects(this.dep),
)
```

其重点在于第二个参数`trigger`和第三个参数`scheduler`。在前文的[dirty](#dirty)部分有讲到当运行`triggerEffects`时会判断副作用的`_dirtyLevel`，如下：

```typescript
if (
  effect._dirtyLevel < dirtyLevel &&
  dep.get(effect) === effect._trackId
) {
  const lastDirtyLevel = effect._dirtyLevel
  effect._dirtyLevel = dirtyLevel
  if (lastDirtyLevel === DirtyLevels.NotDirty) {
    effect._shouldSchedule = true
    if (__DEV__) {
      effect.onTrigger?.(extend({ effect }, debuggerEventExtraInfo))
    }
    effect.trigger()
  }
}
```

在计算属性中，当`getter`被触发时（非第一次），其`_dirtyLevel`为`NoDirty`，在其依赖改变导致触发进入到`triggerEffects`后被修改为`dirty`，在运行其`run`方法后又回到`NoDirty`，可以正常完成运行，没有依赖计算属性的`effect`并不会受到脏值检查的影响。

而`getter`的触发会进入到其`effect.trigger()`，而`getter`传入的`trigger`为`triggerRefValue(this, DirtyLevels.MaybeDirty)`，它会导致依赖此计算属性的副作用函数的调用。当其副作用进入到`triggerEffects`时，其`_dirtyLevel`为`NoDirty`，而`triggerEffects`的参数`dirtyLevel`为`MaybeDirty`，这意味着当`triggerEffects`执行完成后`effect._dirtyLevel`会变为`MaybeDirty`而不是`Dirty`。

对于一般的副作用函数，其创建时传入的调度器如下：

```typescript
if (effect.dirty) {
  effect.run()
}
```

这导致`effect.dirty`的调用，而在其中会导致触发`triggerComputed`而读取计算属性值，导致进入到计算属性的`get value()`代理，在`get value`中会判断`getter`副作用的脏值水平，由于其是在调用调度器之前执行的，故`getter`的脏值水平依然处于`Dirty`，因而可以重新执行`getter`副作用进行计算并与上次缓存值进行对比，若发生改变则会执行`triggerRefValue(this, DirtyLevels.Dirty)`，使得`effect.dirty`为`true`，而由于其原本的`_dirtyLevel`不为`NoDirty`，因此不会执行`trigger`和调度器，只会在`effect.dirty`返回后执行一次`effect.run()`，暨依赖该计算属性的副作用函数。若未发生改变，则会在`get value()`的最后调用`triggerRefValue(this, DirtyLevels.MaybeDirty)`，在执行时由于其副作用的脏值水平为`MaybeDirty`，故并不会触发`trigger`，而最终`effect.dirty`返回得到的值也为`false`，因此不会触发依赖该计算属性的副作用。

我们尝试还原整个`computed`流程（假设调用计算属性值的副作用为`user`，计算属性的计算方法为`getter`）：

1. `getter`的依赖发生改变，触发`getter`，进入`getter`的`trigger`，此时`getter._dirtyLevel`由`NoDirty`变为`Dirty`
2. `getter.trigger()`触发`user`，导致`user._dirtyLevel`变为`MaybeDirty`
3. 进入调度器队列，`getter`自身并不会执行，而是通过它的调度器将`user`送入调度器，`user`判断`.dirty`时触发计算属性的`get value()`，导致重新计算（此处执行`getter`并获得计算结果）
  a. 重新计算结果与原来相同，则什么也不做
  b. 重新计算结果与原来不同，改变`user._dirtyLevel`为`Dirty`
4. `user.dirty`返回值，若计算结果改变，则返回应为`true`，执行`user`调度器。否则返回`false`，不执行调度器。

### 一些常见的响应式问题

#### 连续修改两个响应式变量会重新渲染几次？

由于本文并不涉及到渲染相关的内容，因此直接给出`renderer`的实现：

```typescript
const effect = (instance.effect = new ReactiveEffect(
    componentUpdateFn, 
    NOOP, 
    () => queueJob(update), 
    instance.scope, // track it in component's effect scope
))
const update: SchedulerJob = (instance.update = () => {
  if (effect.dirty) {
    effect.run()
  }
})
```

可以看出渲染的本质便是通过`effect`来实现，渲染函数本身是一个`effect`，当依赖的响应式数据发生变化时，会被重新调用（渲染函数会返回新的`VNode`，然后使用`diff`算法来对比新旧`VNode`并修改对应DOM），而`effect`的调度器是`queueJob`，它会将`effect`推入调度器队列，当调度器队列执行时，会判断`effect.dirty`，若为`true`则执行`effect.run()`，否则不执行。

我们查看`queueJob`的实现：

```typescript
export function queueJob(job: SchedulerJob) {
  // the dedupe search uses the startIndex argument of Array.includes()
  // by default the search index includes the current job that is being run
  // so it cannot recursively trigger itself again.
  // if the job is a watch() callback, the search will start with a +1 index to
  // allow it recursively trigger itself - it is the user's responsibility to
  // ensure it doesn't end up in an infinite loop.
  if (
          !queue.length ||
          !queue.includes(
                  job,
                  isFlushing && job.allowRecurse ? flushIndex + 1 : flushIndex,
          )
  ) {
    if (job.id == null) {
      queue.push(job)
    } else {
      queue.splice(findInsertionIndex(job.id), 0, job)
    }
    queueFlush()
  }
}
function queueFlush() {
  if (!isFlushing && !isFlushPending) {
    isFlushPending = true
    currentFlushPromise = resolvedPromise.then(flushJobs)
  }
}
```

可以看出整体流程其实是将当前副作用的实际执行函数加入到`job`队列中，并使用`resolvedPromise`来保证其在下一个微任务中执行。当`flushJobs`执行时，会遍历`job`队列并执行其中的副作用函数执行。

其实这里我们就可以知道，对响应式数据的修改是在主线程中进行的，它会先于微任务执行（这里实现了一个基于微任务的`tick`，即将所有的`DOM`操作缓存到一个`tick`中执行，避免频繁执行影响体验），因此实际上修改完所有的响应式数据才会开始重新渲染`DOM`。

我们假设一个情况：

```vue
<template>
  <div>{{ a }} {{ b }}</div>
</template>
<script setup>
import { ref } from 'vue'

const a = ref(1)
const b = ref(2)

setTimeout(() => {
  a.value = 2
  b.value = 3
}, 1000)
</script>
```

在例子中，当`a`修改时，会首先触发`trigger`，并正常将其渲染器的调度器推入调度器队列并执行，执行结果是导致`queueJob(update)`的执行，并没有直接执行渲染。而此前我们知道（在[dirty](#dirty)一节），在副作用函数触发但没有真正执行前，它的`_dirtyLevel`会被设置为`Dirty`，而在执行后会被设置为`NotDirty`。因此，当`b`修改时，由于`a`的触发，其副作用（指渲染函数）的`_dirtyLevel`为`Dirty`，但在执行后会被设置为`NotDirty`，因此不会再次执行渲染函数。而在`b`完成修改后，由于主线程已经执行完成，此时在微任务队列中的渲染函数会被执行，导致`DOM`的更新。

因此，在这种情况下，连续修改两个响应式变量会重新渲染一次。
