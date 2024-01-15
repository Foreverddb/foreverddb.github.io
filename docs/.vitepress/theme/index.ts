// https://vitepress.dev/guide/custom-theme
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import './style.less';
import MyLayout from '../views/MyLayout.vue';

export default {
  extends: DefaultTheme,
  Layout: MyLayout,
  enhanceApp({ app, router, siteData }) {
    // ...
  }
} satisfies Theme;
