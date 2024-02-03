---
title: Vue源码解析-响应式系统篇-施工中
date: 2024-01-23
category: 笔记
tags:
- 前端
- 源码
- vue
brief: Vue3响应式系统的源码解析，结合个人复现vue的浅薄经验，逐行解析核心设计思路以及实现细节，以期更好地理解vue的整体原理。
---

# Vue源码解析-响应式系统篇

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

## 依赖追踪与副作用收集

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

### track和trigger

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

#### get代理

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

而对于`push`等方法，由于其调用过程会同时对`length`的读取和修改操作，导致副作用相互影响，产生无限循环触发副作用的问题。试想如下一个情景：

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

##### track实现

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

// TODO trackId分析

```typescript
const oldDep = effect.deps[effect._depsLength]
```

`effect`函数的`deps`属性实质上是一个反向依赖，`depsMap`记录了一个`target`的每个`key`对应的副作用函数列表，而反之，每个副作用函数的`deps`就记录了所有它所处的副作用函数列表。

> 为什么要做这样一个双向的追踪呢？试想副作用函数中存在一个分支结构：```isOk ? a.text : b.text```，第一次执行时`isOk`为true，`a`的`text`属性被收集为依赖，当其更改时会导致重新运行当前副作用函数。而当`isOk`为false时，我们期望`a.text`的更改将不会再触发副作用，所以我们需要一个依赖清除的能力。`effect.deps`会储存每一个用到了`effect`的副作用函数列表，以便在自己运行时清除所有自己想关的依赖。由于副作用函数运行时本身会重新建立依赖，所以不用担心清除后依赖失效的问题。



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


