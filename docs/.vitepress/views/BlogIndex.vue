<script setup lang="ts">
import {data} from '../utils/blogs.data';
import {computed, ref, watch} from "vue";
import {useData} from "vitepress";
import BlogCard from '../components/BlogCard.vue';
import TimelineAnim from '../components/TimelineAnim.vue';
import TextMixAnim from '../components/TextMixAnim.vue';
import CategoryCard from '../components/CategoryCard.vue';
import {BlogDataItem} from '../utils/data-formatter';

console.log(data);

const {frontmatter} = useData();

const {hero} = frontmatter.value;

const isByTime = ref(false);
watch(isByTime, (value) => {
    if (value) {
        categorySelected.value = null;
    } else {
        dateSelected.value = null;
    }
});

const categorySelected = ref<string | null>(null);
const categoryFilter = computed(() => {
    if (categorySelected.value || categorySelected.value === '') {
        return (value: BlogDataItem) => value.category === categorySelected.value;
    } else {
        return (value: BlogDataItem) => value;
    }
});

function handleClickCategory(category: string) {
    if (categorySelected.value === category) {
        categorySelected.value = null;
    } else {
        categorySelected.value = category;
    }
}

const dateSelected = ref<string | null>(null);
const dateFilter = computed(() => {
    return (value: BlogDataItem) => (value.date + '').startsWith(dateSelected.value || '');
});

function handleClickDate(date: string) {
    if (dateSelected.value === date) {
        dateSelected.value = null;
    } else {
        dateSelected.value = date;
    }
}

const tagsSelected = ref<string[]>([]);
const tagsFilter = computed(() => {
    return (value: BlogDataItem) => {
        if (tagsSelected.value.length === 0) {
            return value;
        } else {
            return tagsSelected.value.every((tag) => value.tags.includes(tag));
        }
    };
});

function handleTagSelected(tag: string) {
    if (tagsSelected.value.includes(tag)) {
        tagsSelected.value = tagsSelected.value.filter((value) => value !== tag);
    } else {
        tagsSelected.value.push(tag);
    }
}

const blogs = computed(() => {
    return data.data
        .filter(categoryFilter.value)
        .filter(dateFilter.value)
        .filter(tagsFilter.value);
});

const colors = Array.from(new Array(data.tags.length), () => {
    return `hsl(${Math.random() * 360}, 60%, 60%)`;
});
</script>

<template>
    <TextMixAnim/>
    <header>
        <TimelineAnim :timeline="data.timeLine"/>
        <h1 class="header-title" style="--word-total: 1; --char-total: 5;" data-splitting>
            <span class="char" v-for="(s, i) in (hero?.title || 'blogs')" :style="{
                '--char-total': (hero?.title || 'blogs').length,
                '--char-index': i,
            }">{{ s }}</span>
        </h1>
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
                :key="blog.url"
                :data="blog"
            />
        </main>
        <aside>
            <div class="part-header">
                🏷 文章归档
                <div @click="isByTime = !isByTime">
                    <svg viewBox="0 0 1028 1024"
                         xmlns="http://www.w3.org/2000/svg" width="16" height="16">
                        <path
                            d="M470.791621 216.202867 470.791621 149.027563c-172.171996 0-316.683572 120.238148-353.375965 281.120176L19.192944 430.14774l128.141125 163.140022 128.705623-163.140022L186.284454 430.14774C221.84785 306.522602 335.876516 216.202867 470.791621 216.202867z"
                            fill="currentColor"></path>
                        <path
                            d="M1027.951488 593.287762l-128.705623-163.140022-128.141125 163.140022 87.497244 0c-35.563396 123.625138-149.592062 214.509372-285.071665 214.509372L573.53032 874.972437c172.171996 0 316.683572-120.238148 353.940463-281.684675L1027.951488 593.287762z"
                            fill="currentColor"></path>
                        <path
                            d="M477.001103 628.286659 204.9129 628.286659c-8.467475 0-15.241455 6.77398-15.241455 15.241455l0 272.088203c0 8.467475 6.77398 15.241455 15.241455 15.241455l272.088203 0c8.467475 0 15.241455-6.77398 15.241455-15.241455L492.242558 643.528115C492.242558 635.060639 485.468578 628.286659 477.001103 628.286659zM429.583241 859.730981c0 5.080485-3.951488 9.031974-9.031974 9.031974L260.798236 868.762955c-5.080485 0-9.031974-3.951488-9.031974-9.031974L251.766262 699.977949c0-5.080485 3.951488-9.031974 9.031974-9.031974l159.753032 0c5.080485 0 9.031974 3.951488 9.031974 9.031974L429.583241 859.730981 429.583241 859.730981z"
                            fill="currentColor"></path>
                        <path
                            d="M845.054024 90.319735l-272.088203 0c-8.467475 0-15.241455 6.77398-15.241455 15.241455L557.724366 378.213892c0 8.467475 6.77398 15.241455 15.241455 15.241455l272.088203 0c8.467475 0 15.241455-6.77398 15.241455-15.241455L860.29548 106.125689C860.29548 97.658214 853.521499 90.319735 845.054024 90.319735zM797.636163 321.764057c0 5.080485-3.951488 9.031974-9.031974 9.031974l-159.753032 0c-5.080485 0-9.031974-3.951488-9.031974-9.031974L619.819184 162.011025c0-5.080485 3.951488-9.031974 9.031974-9.031974l159.753032 0c5.080485 0 9.031974 3.951488 9.031974 9.031974L797.636163 321.764057z"
                            fill="currentColor"></path>
                    </svg>
                    按{{ isByTime ? '类型' : '时间' }}
                    <div class="switch-bg">BY {{ isByTime ? 'CATEGORY' : 'TIME' }}</div>
                </div>
            </div>
            <div class="categories-container">
                <template v-if="!isByTime">
                    <CategoryCard
                        v-for="category in data.categories"
                        :key="category.name"
                        :category="category.name || '未分类'"
                        :frequency="category.frequency"
                        @click="handleClickCategory(category.name)"
                        :selected="categorySelected === category.name"
                    />
                </template>
                <template v-else>
                    <CategoryCard
                        v-for="time in [...data.timeLine].reverse()"
                        :key="time.time"
                        :category="time.time"
                        :frequency="time.frequency"
                        @click="handleClickDate(time.time)"
                        :selected="dateSelected === time.time"
                    />
                </template>
            </div>
            <div class="tags-container">
                <div class="tags-header">📑 标签</div>
                <div class="tags">
                    <div
                        class="tag"
                        v-for="(tag, index) in data.tags"
                        :class="(tagsSelected.length && !tagsSelected.includes(tag)) ? 'unselected' : ''"
                        :style="{
                            '--tag-bg-color': (tagsSelected.length && !tagsSelected.includes(tag)) ? 'gray' : colors[index],
                            animationDelay: `${(Math.floor(index / 4) * Math.random() * 1.2  + 0.5).toFixed(2)}s`,
                        }"
                        @click="handleTagSelected(tag)"
                    >
                        {{ tag }}
                    </div>
                </div>
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
        text-shadow: 1px 1px 1px var(--vp-c-text-3);
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

        .char {
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

    @media screen and (max-width: 767px) {
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
        display: flex;
        align-items: end;
        white-space: nowrap;

        &:hover {
            &::before, &::after {
                transform: scaleX(1.5);
            }
        }

        div {
            height: 18px;
            width: fit-content;
            font-size: 16px;
            font-weight: 400;
            color: var(--vp-c-gray-3);
            filter: invert(1);
            display: flex;
            align-items: end;
            line-height: 1;
            margin-left: 3px;
            //border: 1px dashed var(--vp-c-gray-3);
            border-radius: 4px;
            white-space: nowrap;
            position: relative;

            svg {
                margin-right: 3px;
                display: inline;
            }

            &:hover {
                border-color: var(--vp-c-green-3);
                cursor: pointer;
                color: var(--vp-c-green-3);
            }

            .switch-bg {
                position: absolute;
                bottom: 0;
                left: 0;
                white-space: nowrap;
                color: gray;
                border: none;
                font-weight: 900;
                font-size: 26px;
                z-index: -1;
                opacity: 0.3;
                transform-origin: 0;
                transform: scaleX(0.4);
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
            filter: brightness(1.5);
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
            filter: brightness(1.2);
        }
    }

    main {
        width: 100%;
        max-width: 767px;
        min-width: 300px;
        flex: 5;
    }

    aside {
        width: 100%;
        flex: 2;

        .categories-container {
            padding: 0 0 5px 0;
            border-left: 2px transparent solid;
            border-right: 2px transparent solid;
            border-bottom: 3px solid var(--vp-c-sponsor);
        }

        .tags-container {
            margin: 10px 0;

            .tags-header {
                font-size: 20px;
                font-weight: 600;
                color: var(--vp-c-text-1);
                margin: 10px 0;
            }

            .tags {
                display: flex;
                flex-wrap: wrap;
                width: 100%;
                color: white;
                font-weight: 600;

                .tag {
                    padding: 2px 5px;
                    margin: 3px 5px;
                    animation: 1s forwards fallDown ease-in-out;
                    border-radius: 6px;
                    transform: translateY(-180px) scaleX(.1) scaleY(.3);
                    opacity: 0;
                    background-color: var(--tag-bg-color);

                    &:hover {
                        cursor: pointer;
                        background-color: oklch(from var(--tag-bg-color) calc(l - 25) c h);
                    }
                }

                @keyframes fallDown {
                    0% {
                        transform: translateY(-180px) scaleX(.1) scaleY(.3);
                        opacity: 1;
                    }
                    20% {
                        transform: translateY(-200px) scaleX(.6) scaleY(.3);
                    }
                    75% {
                        transform: translateY(0) scaleX(.6) scaleY(.3);
                    }
                    100% {
                        transform: translateY(0) scaleX(1) scaleY(1);
                        opacity: 1;
                    }
                }
            }
        }
    }
}
</style>
