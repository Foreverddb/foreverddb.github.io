<script setup lang="ts">
import {data} from '../utils/blogs.data';
import {computed, onMounted} from "vue";
import Splitting from 'splitting';
import {useData} from "vitepress";
import BlogCard from '../components/BlogCard.vue';
import Timeline from '../components/Timeline.vue';

console.log(data);

const {frontmatter} = useData();

const {hero} = frontmatter.value;

const blogs = computed(() => {
   return data.data.filter((value, index, array) => value);
});

onMounted(() => {
    Splitting();
});
</script>

<template>
    <header>
        <Timeline :timeline="data.timeLine"/>
        <h1 class="header-title" data-splitting>{{ hero?.title || 'Blogs' }}</h1>
        <span class="bg-title">{{ hero?.title || 'Blogs' }}</span>
        <span class="subtitle">{{ hero?.subtitle || 'DdB is working every night and day.' }}</span>
    </header>
    <div class="content-wrapper">
        <main>
            <div class="part-header">
                🏙 近期文章
            </div>
            <BlogCard
                v-for="blog in blogs"
                :key="blog"
                :data="blog"
            />
        </main>
        <aside>
            <div class="part-header">
                 🏷 文章分类
            </div>
        </aside>
    </div>
</template>

<style lang="less" scoped>
header {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    padding-top: 70px;
    gap: 5px;

    .bg-title {
        position: absolute;
        top: 70px;
        left: 0;
        right: 0;
        text-align: center;
        font-weight: bold;
        color: gray;
        opacity: 0.2;
        font-size: calc(32px + 2vw);
    }

    .subtitle {
        font-size: 20px;
        font-weight: 300;
        color: var(--vp-c-text-3);
    }

    .header-title {
        --color: #f5628e;
        --color-2: #df5efe;
        --color-3: #7149f8;
        font-size: calc(28px + 1.5vw);
        font-weight: bold;
        letter-spacing: -0.05em;
        color: var(--color);
        text-align: center;
        line-height: 1.15;

        :deep(.char) {
            background: linear-gradient(-45deg,
            var(--color) 45%,
            var(--color-2) 45%,
            var(--color-2) 50%,
            var(--color-3) 50%);
            background-size: 2em 3em;
            z-index: calc(var(--char-total) - var(--char-index));
            position: relative;
            animation: bg-pos 2.5s cubic-bezier(0.6, 0, 0, 1) infinite alternate;
            @keyframes bg-pos {
                0% {
                    background-position: 0 0;
                }

                80%,
                100% {
                    background-position: -1em -1.5em;
                }
            }
            animation-delay: calc((var(--char-index)) * 0.1s);
            background-clip: text;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
    }
}

.content-wrapper {
    display: flex;
    justify-content: flex-start;
    padding: 20px 15px 25px 15px;
    gap: 20px;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;

    @media screen and (max-width: 750px) {
        flex-direction: column;
        align-items: flex-start;

        aside {
            order: 0;
            width: 100%;
        }

        main {
            order: 1;
            width: 100%;
        }
    }

    .part-header {
        font-size: 28px;
        font-weight: 700;
        color: var(--vp-c-text-1);
        margin: 30px 0 35px 0;
        position: relative;

        &:hover {
            &::before, &::after {
                transform: scaleX(1.5);
            }
        }

        &::before {
            content: "";
            position: absolute;
            bottom: -10px;
            left: 0;
            width: 100px;
            height: 5px;
            background: var(--vp-c-indigo-3);
            clip-path: polygon(0 0, 100% 0, calc(100% - 3px) 100%, 0 100%);
            transition: 0.5s all ease-in-out;
            transform-origin: 0 0;
        }

        &::after {
            content: "";
            position: absolute;
            bottom: -18px;
            left: 0;
            width: 160px;
            height: 5px;
            background: var(--vp-c-sponsor);
            clip-path: polygon(0 0, 100% 0, calc(100% - 3px) 100%, 0 100%);
            transition: 0.5s all ease-in-out;
            transform-origin: 0 0;
        }
    }

    main {
        width: 100%;
        max-width: 750px;
        min-width: 300px;
    }

    aside {
        width: 300px;
    }
}
</style>
