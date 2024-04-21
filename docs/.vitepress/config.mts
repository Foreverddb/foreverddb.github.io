import { defineConfig } from 'vitepress';
import { fileURLToPath, URL } from 'node:url';
import sidebarData from './utils/sidebar.data';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "DdB's Blog",
  description: "ForeverDdB's personal blog site",
  head: [["link", { rel: "icon", href: "/index.png" }]],
  lastUpdated: true,
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      // { text: 'About', link: '/about' },
      { text: 'Blogs', link: '/blogs/' },
    ],
    sidebar: sidebarData('/docs/blogs/posts'),

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Foreverddb' }
    ],

    search: {
      provider: 'local',
    },
    outline: 'deep',

  },
  vite: {
    resolve: {
      alias: [
        {
          find: /^.*\/VPDocFooterLastUpdated\.vue$/,
          replacement: fileURLToPath(
              new URL("./components/UpdateTime.vue", import.meta.url)
          ),
        },
        {
          find: /^.*\/VPFooter\.vue$/,
          replacement: fileURLToPath(new URL("./components/Footer.vue", import.meta.url)),
        },
      ],
    },
  },
})
