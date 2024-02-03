---
title: 基于flex的瀑布流布局简易实现
date: 2023-11-20
tags:
  - vue
  - 瀑布流
  - 布局
category: 笔记
brief: 鹅厂实习时入手的第一个简单需求，瀑布流布局的实现，给出了两种实现方式。
---

# 基于flex的瀑布流布局简易实现

源于实习的某个图库展示需求。

需要支持瀑布流展示、滚动加载与批量操作。

本文用于复盘与记录，组件设计本身可能有点抽象。

创建gallery目录，目录结构如下：

- gallery
    - index.vue
    - index.ts
    - gallery-layout
        - index.vue
        - index,ts
    - gallery-header
        - index.vue
        - index.ts
    - gallery-image
        - index.vue
        - index.ts

顶层组件用于整合**layout**和**header**部分，其分别对应瀑布流的布局组件和头部的批量操作组件。此外**image**组件用于保有/控制单张图片的操作与状态。

## 瀑布流布局

```html
		<div
          v-for="(column, colIndex) in gridColumns"
          :key="column"
          :style="{
            width: gridWidth + 'px',
          }"
          :class="$style.column"
        >
          <gallery-image
            v-for="(image, rowIndex) in column"
            :key="image.id"
            :batch="batch"
            :image="image"
            :grid-width="gridWidth"
            :checked="selectedImages.includes(image.id)"
            @preview="handlePreview(rowIndex * columnNum + colIndex)"
            @batch="handleBatch"
            @delete="handleDelete"
          />
        </div>
```

将容器划分为多个列，每个列向下排列图片，列之间按从左到右排列。
首先计算列数，封装一个初始化布局函数，将其设置为页面resize事件的处理器，便于在每次页面大小改变时重新计算布局，并将新列数通知给父组件（为了避免重复计算，以及手动划分images的列时数组改变导致全部列重绘，将划分images的操作交给父组件）：

```typescript
	const initLayout = () => {
      if (!container.value) {
        return;
      }
      const { clientWidth: width } = document.body;

      // 获取容器宽度
      const containerWidthStr = getComputedStyle(container.value).width;
      const containerWidth = parseInt(containerWidthStr, 10);

      // 自适应每列宽度
	    columnNum.value = Math.floor(containerWidth / baseWidth);
		
	    // 计算每列宽度
      gridWidth.value = (containerWidth - (columnNum.value - 1) * gapWidth) / columnNum.value;

      emit('resize', columnNum.value);
    };
	
	window.addEventListener('resize', initLayout);
```

接下来在父组件中处理每列图像划分，我们维护一个二维数组，其每一个子数组都代表一个图片列。为了避免每次或许新数据创建新数组导致全部重绘，我们将划分操作分为两种情况：

1. 直接在原有数组上新增内容，需要判断新数据是哪些以及分别需要push到哪一列
2. 页面重新加载的情况，直接创建新数组

```typescript
	// preLen用于在push模式下得到旧数据位置，以计算新数据的位置范围
	const flowImages = (prevLen: number, init = false) => {
      const colNum = gridColumns.value.length;
      if (init) {
	  	  // 创建并填充每一列
        const tempColumns = Array.from(new Array(colNum), () => new Array(0));
        imageList.value.forEach((item, index) => {
          const i = index % colNum;
          tempColumns[i].push(item);
        });

        gridColumns.value = tempColumns;
      } else {
        const data = imageList.value.slice(prevLen, imageList.value.length);
        const tempColumns = [...gridColumns.value];

        data.forEach((item, index) => {
          const i = (prevLen + index) % colNum;
          tempColumns[i].push(item);
        });

        gridColumns.value = tempColumns;
      }
    };
```

可以发现，此基于每列渲染的方式对于频繁改变删增元素的情况适用性较差。因为例如：删除某一列的某个元素时，要应用新的布局，会导致v-for下的每一列内容都发生变化，会导致dom的大量重建，而瀑布流常常用于大量dom内容的情况，dom重建数量一般较大，可能会导致体验非常不好。

## 优化

参考了一个基于flex的实现：
https://github.com/Tsuk1ko/vue-flex-waterfall/blob/master/src/VueFlexWaterfall.vue

原理是限制总容器高度，然后每一列使用css的order属性进行区分，同时使用flex-wrap来换列，这样可以保证无论元素的产生顺序，总可以依靠order属性来展示到对应位置。

为了保证同一列的元素不会换行而只会在每一列的分界处换行，我们可以在容器的末尾插入N个高度为100%的透明元素，并分别设置不同列的order，作为每一列wrap时的分界元素。

```html
<div class="parent">
	<div v-for="..." class="item">
	...前面的内容元素
	</div>
	<div
	  v-for="item in colNum - 1"
	  :key="item"
	  :style="{
		order: item - 1,
	  }"
	  class="col-sp"
	></div>
</div>
```

一般来说，元素的height是可列出的，因此对于每个元素我们都假设已经预设好了长宽，这部分的计算就可以暂且搁置。我们列出一个元素对象的基础结构：

```typescript
const data = [
  {
    label: '测试0',
    value: 'test1',
    height: 200,
    order: 0,
  },
  {
    label: '测试1',
    value: 'test2',
    height: 300,
    order: 1,
  },
  {
    label: '测试2',
    value: 'test3',
    height: 200,
    order: 2,
  },
  {
    label: '测试3',
    value: 'test4',
    height: 350,
    order: 3,
  }
];
```

据此，我们可以方便地得到每一列的高度，以及当前高度最小的一列、容器所需的最小高度：

```typescript
const containerState = computed(() => {
  const temp = Array.from(new Array(colNum), (_, index) => {
    return data
      .filter((item) => item.order === index)
      .map((item) => item.height)
      .reduce((prev, curr) => {
      	return prev + curr + 5; // 5为每个元素之间的间距
    }, 0);
  });
  return {
    height: Math.max(...temp),
    minCol: temp.indexOf(Math.min(...temp)),
  };
});
```

其中，height为当前容器应有的高度，minCol为当前最矮的一列，也是增添下一个元素时应该放置元素的一列。此时元素就已经初步具备了响应式的瀑布流布局能力，接下来需要解决的是删除元素时更新整体的排列能力。

```typescript
const updateOrder = () => {
  const colsHeight = new Array(colNum).fill(0);
  data.value.forEach((item) => {
    const minI = colsHeight.indexOf(Math.min(...colsHeight));
    const oldOrder = item.order;
    const newOrder = minI;
    if (oldOrder !== newOrder) {
      item.order = newOrder;
    }
    colsHeight[minI] += item.height;
  });
};
```

当删除元素时调用`updateOrder`方法，可以重新为所有的元素赋上新的order，而此方法相比此前传统做法改变每个列的元素导致重构全部dom的情况，只会产生页面的回流，其造成的体验和性能影响大大降低。

