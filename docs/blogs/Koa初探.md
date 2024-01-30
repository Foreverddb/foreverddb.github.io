---
title: Koa初探
date: 2023-11-15
category: 笔记
---

# Koa初探

## 特性

### 洋葱模型

koa是一个轻量级的nodejs后端模型，使用**洋葱模型**，对node的http模块进行了一个封装，可以方便地进行组合与编写中间件。

一个基本的洋葱模型实例如下：

```typescript
const app = new Koa();
app.use(async (ctx, next) => {
  console.log(1);
  await next();
  console.log(3);
});
app.use(async (ctx, next) => {
  console.log(2);
});
app.listen(3000);
// 输出依次为 1 2 3
```

它的中间件执行会首先按顺序，遇到next则往下执行，执行完成后回到next的位置往下执行，像函数执行栈一样遇到next则推入执行，如同一个洋葱。

![461dbf9917634fe1a1b578237ad78600~tplv-k3u1fbpfcp-zoom-in-crop-mark_1512_0_0_0](Koa初探/461dbf9917634fe1a1b578237ad78600~tplv-k3u1fbpfcp-zoom-in-crop-mark_1512_0_0_0.webp)

这是koa的精髓所在，可以方便地基于此特性组合中间件，如logger：

```typescript
export default function logger() {
    return async function (ctx: ParameterizedContext, next: Next) {
        const start = +new Date();
        await next();
        const ms = +new Date() - start;
        console.log(`耗时${ms}`ms);
    };
}

app.use(logger());
```

将此中间件作为第一个use，则可以方便计算出完整请求的执行消耗时间。

### 一些封装

koa对http模块的常用部分使用了get与set代理，便于以如下形式访问属性：

```typescript
ctx.method
// ctx.request.method
```

此外，还有一些直观的http上下文方法：

```typescript
ctx.body = {
  text: 'test'
}
// 使请求响应此json内容
ctx.url
// 请求url
```

## 实践

