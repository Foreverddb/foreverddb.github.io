<script setup>
import DefaultTheme from 'vitepress/theme';
import {useData} from "vitepress";
import {computed} from "vue";
import IndexAnim from "../components/IndexAnim.vue";

const { Layout } = DefaultTheme;

const { frontmatter } = useData();

const isHome = computed(() => {
  return frontmatter.value.layout === 'home';
});

</script>

<template>
  <IndexAnim v-if="isHome" />
  <Layout>
    <template #not-found>
      test
    </template>
  </Layout>
</template>

<style>
#app {
  position: relative;
}
</style>
