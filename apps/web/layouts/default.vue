<script setup lang="ts">
// 認証確定前の描画を止めるガード (2026-07-07)。
//
// 背景: routeRules の ssr:false (nuxt.config.ts) で SSR からの中身送信は止めたが、
// クライアント側は「ページがマウントされてから Firebase の onAuthStateChanged が
// 初回発火するまで」の間、認証結果を待たずに中身 (空データの Shell) をそのまま
// 描画してしまう。isInitialized が true になった後の再判定 (middleware +
// plugins/auth-redirect.client.ts) がリダイレクトするまでの一瞬、未認証でも
// 本来の画面が見えてしまう (シークレットモードでの実機確認で発覚)。
//
// ここで isInitialized が確定するまで <slot /> 自体を描画しない (何も見せない) ようにし、
// 未認証確定後もリダイレクトが効くまでの一瞬は空のまま (中身を描画しない) にする。
// login.vue は definePageMeta({ layout: false }) でこの layout の対象外。

const { isAuthenticated, isInitialized } = useAuth();
</script>

<template>
  <slot v-if="isInitialized && isAuthenticated" />
</template>
