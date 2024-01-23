<script setup lang="ts">
import {PropType} from 'vue';
import {BlogDataItem} from '../utils/data-formatter';
defineProps({
    data: {
        type: Object as PropType<BlogDataItem>,
        required: true,
    }
});

const TAG_COLORS = [
    '#e97171',
    '#e9c971',
    '#a362e8',
    '#e1835a',
    '#e8305a',
    '#9e13d2',
    '#189b79',
    '#22b2e7',
];
</script>

<template>
  <a :href="data.url" class="blog-card">
      <span>{{ data.date }}</span>
      <h1>{{ data.title }}</h1>
      <article>
          {{ data.brief }}
      </article>
      <div class="tags">
          <div v-if="data.category" class="category">
              {{ data.category }}
          </div>
          <div v-for="(tag, index) in data.tags"
               class="tag"
               :style="{
                   color: TAG_COLORS[index % TAG_COLORS.length],
                   borderColor: TAG_COLORS[index % TAG_COLORS.length],
               }"
          >
              {{ tag }}
          </div>
      </div>
  </a>
</template>

<style lang="less" scoped>
.blog-card {
    max-width: 767px;
    min-width: 300px;
    width: 100%;
    margin: 15px 0;
    //background: var(--vp-c-bg);
    border: 1px var(--vp-c-gray-1) solid;
    padding: 15px 20px;
    border-radius: 8px;
    position: relative;
    transition: 0.7s all ease-in-out;
    overflow: hidden;
    display: block;

    article {
        color: var(--vp-c-text-2);
    }

    &::after {
        content: "";
        position: absolute;
        width: 0;
        height: 100%;
        left: 0;
        top: 0;
        background: rgba(217, 147, 147, 0.1);
        clip-path: polygon(
            0 0,
            100% 0,
            calc(100% - 20px) 100%,
            0 100%
        );
        z-index: -1;
        transition: 0.6s all ease-in-out;
    }

    &:hover {
        background: transparent;
        box-shadow: 2px 3px 2px rgba(0,0,0,0.2);
        border-color: #e97171 !important;

        &::after {
            width: calc(100% + 20px);
        }
    }

    &:hover {
        cursor: pointer;
    }

    span {
        color: var(--vp-c-text-3);
        font-size: 14px;
    }

    h1 {
        color: var(--vp-c-text-1);
        font-size: 20px;
        font-weight: 700;
        margin: 5px 0;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
    }

    .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 8px;

        .tag {
            font-size: 14px;
            line-height: 18px;
            padding: 2px 8px;
            border: 1px var(--vp-c-border) solid;
            border-radius: 5px;
        }
    }
}
</style>
