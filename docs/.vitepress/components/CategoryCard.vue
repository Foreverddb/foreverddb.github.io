<script setup lang="ts">
import * as pinyin from 'pinyin_js';

defineProps({
    category: {
        type: String,
        required: true,
    },
    frequency: {
        type: Number,
        default: 0,
    },
    selected: {
        type: Boolean,
        default: false,
    },
});
const emit = defineEmits(['click']);

const CapitalNumerals = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
function stringToCapitalNumerals(str: string) {
    let result = '';
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '-') {
            result += '-';
            continue;
        }
        result += CapitalNumerals[parseInt(str[i])];
    }
    return result;
}
</script>

<template>
    <div @click="emit('click')" class="category-container" :class="selected ? 'selected' : ''">
        <span class="frequency">{{ frequency }}</span>
        <p>{{ category }} &nbsp;</p>
        <span>{{ parseInt(category.replace('-', '')) + '' === category.replace('-', '') ? stringToCapitalNumerals(category) : pinyin.pinyinWithOutYin(category, '') }}</span>
        <div>
        </div>
    </div>
</template>

<style scoped lang="less">
.category-container {
    padding: 15px 12px;
    font-weight: 800;
    width: 100%;
    border-radius: 8px;
    text-transform: uppercase;
    display: flex;

    .frequency {
        display: inline-block;
        border-radius: 4px;
        border: 1px solid var(--vp-c-red-soft);
        background: var(--vp-c-red-soft);
        width: 30px;
        text-align: center;
        color: var(--vp-c-red-2);
        margin-right: 6px;
    }

    p {
        display: inline;
        white-space: nowrap;
    }

    span {
        font-weight: 200;
        white-space: nowrap;
    }

    div {
        margin-left: auto;
    }

    &:hover {
        cursor: pointer;
        background: var(--vp-c-red-soft);
    }

    &.selected {
        filter: brightness(2);
        background: var(--vp-c-red-3);

        p, span, div {
            color: var(--vp-c-bg);
        }
    }
}
</style>