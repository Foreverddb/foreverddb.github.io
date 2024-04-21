<script setup lang="ts">
import {useData} from 'vitepress';
import dayjs from 'dayjs';

const { frontmatter, page } = useData();
</script>

<template>
    <div class="update-time">
        Last Updated At：<span>{{ dayjs(frontmatter.date).format('YYYY-MM-DD') }}</span>
    </div>
</template>

<style scoped lang="less">
.update-time {
    font-weight: 600;
    font-size: 14px;
    position: relative;
    padding-left: 10px;

    span {
        color: var(--vp-c-sponsor);
    }

    &:after {
        position: absolute;
        content: '';
        height: 80%;
        width: 3px;
        background-color: var(--vp-c-sponsor);
        left: 0;
        top: 0;
        bottom: 0;
        margin: auto;
    }
}
</style>