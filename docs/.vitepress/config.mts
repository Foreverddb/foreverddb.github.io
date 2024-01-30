import { defineConfig } from 'vitepress';
import { fileURLToPath, URL } from 'node:url';
import sidebarData from './utils/sidebar.data';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "DdB's Blog",
  description: "ForeverDdB's personal blog site",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Blogs', link: '/blogs/' }
    ],

    sidebar: sidebarData('/docs/blogs/posts'),

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Foreverddb' }
    ],

    search: {
      provider: 'local',
    },
  },
  vite: {
    resolve: {
      alias: [
        {
          find: /^.*\/VPFooter\.vue$/,
          replacement: fileURLToPath(new URL("./components/Footer.vue", import.meta.url)),
        },
      ],
    },
  },
})
