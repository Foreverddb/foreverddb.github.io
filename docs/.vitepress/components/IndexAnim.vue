<script setup lang="ts">
import gsap from 'gsap';
import {onMounted, ref} from "vue";
import {useData} from "vitepress";

const mask = ref<HTMLElement>();
const logo = ref<HTMLElement>();

const { isDark } = useData();

onMounted(() => {
  gsap.timeline({
    defaults: {
      duration: 0.5,
      ease: 'power3.in',
    },
  }).addLabel('logo')
      .to(logo.value, {
        backgroundPositionX: '-300px',
        ease: 'power3.in',
        delay: 0.3,
        duration: 0.5,
      })
      .to(logo.value, {
        opacity: 0,
        x: '100%',
      }, 'logo+=1')
      .to(mask.value, {
        background: isDark.value ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0)',
        duration: 0.5,
      }, 'logo+=1.2')
      .addLabel('end')
      .to(mask.value, {
        display: 'none',
        duration: 0.1,
      });
});
</script>

<template>
  <div ref="mask" class="mask">
    <section>
      <div ref="logo" class="logo">DdB</div>
    </section>

  </div>
</template>

<style lang="less" scoped>
.mask {
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background-color: var(--vp-c-bg);
  z-index: 10000;
  display: flex;
  justify-content: center;
  align-items: center;

  section {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    .logo {
      font-size: 10vw;
      line-height: 1.15;
      font-weight: bold;
      color: transparent;
      background-image: radial-gradient(circle 200px at 19.2% 64.8%, #7962d7 9.7%, #ff536c 91.3%);
      background-size: 1000px;
      background-position-x: 0;
      background-clip: text;
      -webkit-background-clip: text;
    }
  }
}
</style>
