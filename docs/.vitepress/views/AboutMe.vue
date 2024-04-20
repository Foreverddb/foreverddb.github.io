<script setup lang="ts">

</script>

<template>
    <div class="header-container">
        <div class="avatar-wrapper">
            <img class="avatar" src="/avatar.jpg" alt="avatar"/>
        </div>
    </div>
</template>

<style scoped lang="less">
@loader-color: linear-gradient(#f1c4fa, #dacff6, #f3cbc8);
.header-container {
    height: 250px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;

    .header-bg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: -1;
    }

    .avatar-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100px;
        height: 100px;
        border-radius: 50%;
        box-shadow: 0 2px 3px rgba(0, 0, 0, 0.15);

        .avatar {
            z-index: 10;
            border-radius: 50%;
            width: 90px;
            height: 90px;
        }
    }
}
</style>