<script setup lang="ts">
// Belvedere — 全アイコン統合 (Designer の icons.jsx を Vue 化)
// 使い方: <Icon name="search" /> / <Icon name="brand" />

interface Props {
  name: string;
  size?: number;
  stroke?: number;
}
const props = withDefaults(defineProps<Props>(), { size: 16, stroke: 1.25 });

// 各アイコンの SVG path (icons.jsx を移植)
const PATHS: Record<string, string> = {
  backlog:    'M2 3h12v2.5H2zM2 6.75h12v2.5H2zM2 10.5h12v2.5H2z',
  planning:   'M2 3h12v10H2zM2 6h12M5 3v10M9 3v10',
  daily:      '', // circle + path
  review:     'M2 12V4l6 4 6-4v8M2 12h12',
  retro:      'M3 8a5 5 0 1 0 1.6-3.7M3 3v3h3',
  roadmap:    'M2 4h12M2 8h8M2 12h12',
  search:     '', // circle + path
  plus:       'M8 3v10M3 8h10',
  filter:     'M2 3h12L9.5 8v5L6.5 11.5V8z',
  sort:       'M4 3v10M2 11l2 2 2-2M10 13V3M8 5l2-2 2 2',
  drag:       '', // dots
  settings:   '', // circle + path
  bell:       'M4 7a4 4 0 1 1 8 0v4l1 1H3l1-1zM6.5 13.5a1.5 1.5 0 0 0 3 0',
  sparkle:    'M8 2v4M8 10v4M2 8h4M10 8h4M4 4l2 2M10 10l2 2M4 12l2-2M10 6l2-2',
  send:       'M2 8L14 3l-4 11-3-5z',
  mic:        '', // rect + path
  check:      'M3 8l3 3 7-7',
  x:          'M3 3l10 10M13 3L3 13',
  caret:      'M4 6l4 4 4-4',
  caretRight: 'M6 4l4 4-4 4',
  up:         'M3 10l5-5 5 5',
  down:       'M3 6l5 5 5-5',
  warn:       'M8 2l6.5 11h-13zM8 7v3M8 11.5v0.5',
  info:       '', // circle + path
  eye:        '', // path + circle
  link:       'M6 10l4-4M5 9l-2 2a2 2 0 0 0 2.8 2.8L8 12M11 4l2-2a2 2 0 0 1 2.8 2.8L14 7',
  branch:     '', // circles + path
  clock:      '', // circle + path
  comment:    'M2 4h12v7H8l-3 3v-3H2z',
  flag:       'M3 14V2M3 2.5h9l-2 3 2 3H3',
  pin:        'M5 2h6l-1 4 2 2H4l2-2zM8 8v6',
  spiral:     'M8 8m-6 0a6 6 0 1 0 12 0 6 6 0 1 0 -12 0M8 8m-3.5 0a3.5 3.5 0 1 0 7 0M8 8m-1.2 0a1.2 1.2 0 1 0 2.4 0',
};
</script>

<template>
  <!-- Brand spiral mark (special) -->
  <svg v-if="name === 'brand'" :width="size" :height="size" viewBox="0 0 22 22" fill="none">
    <rect x="0.5" y="0.5" width="21" height="21" stroke="#B8AE9B" />
    <path d="M11 11 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0
             M11 11 m-4.5 0 a4.5 4.5 0 1 0 9 0
             M11 11 m-2 0 a2 2 0 1 0 4 0"
          stroke="#2A2620" stroke-width="0.9" fill="none" />
    <circle cx="11" cy="11" r="0.9" fill="#C8623A" />
  </svg>

  <!-- Daily (clock) -->
  <svg v-else-if="name === 'daily' || name === 'clock'" :width="size" :height="size" viewBox="0 0 16 16"
       fill="none" stroke="currentColor" :stroke-width="stroke" stroke-linecap="square" stroke-linejoin="miter">
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.5V8l2.2 1.4" />
  </svg>

  <!-- Search -->
  <svg v-else-if="name === 'search'" :width="size" :height="size" viewBox="0 0 16 16"
       fill="none" stroke="currentColor" :stroke-width="stroke" stroke-linecap="square" stroke-linejoin="miter">
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </svg>

  <!-- Settings -->
  <svg v-else-if="name === 'settings'" :width="size" :height="size" viewBox="0 0 16 16"
       fill="none" stroke="currentColor" :stroke-width="stroke" stroke-linecap="square" stroke-linejoin="miter">
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" />
  </svg>

  <!-- Drag dots -->
  <svg v-else-if="name === 'drag'" :width="size" :height="size" viewBox="0 0 16 16"
       fill="currentColor" stroke="currentColor" :stroke-width="stroke">
    <circle cx="6" cy="4" r="0.8" />
    <circle cx="10" cy="4" r="0.8" />
    <circle cx="6" cy="8" r="0.8" />
    <circle cx="10" cy="8" r="0.8" />
    <circle cx="6" cy="12" r="0.8" />
    <circle cx="10" cy="12" r="0.8" />
  </svg>

  <!-- Mic -->
  <svg v-else-if="name === 'mic'" :width="size" :height="size" viewBox="0 0 16 16"
       fill="none" stroke="currentColor" :stroke-width="stroke" stroke-linecap="square" stroke-linejoin="miter">
    <rect x="6" y="2" width="4" height="7" rx="2" />
    <path d="M3 8a5 5 0 0 0 10 0M8 13v2" />
  </svg>

  <!-- Info -->
  <svg v-else-if="name === 'info'" :width="size" :height="size" viewBox="0 0 16 16"
       fill="none" stroke="currentColor" :stroke-width="stroke" stroke-linecap="square" stroke-linejoin="miter">
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7v4M8 5v0.5" />
  </svg>

  <!-- Eye -->
  <svg v-else-if="name === 'eye'" :width="size" :height="size" viewBox="0 0 16 16"
       fill="none" stroke="currentColor" :stroke-width="stroke" stroke-linecap="square" stroke-linejoin="miter">
    <path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z" />
    <circle cx="8" cy="8" r="2" />
  </svg>

  <!-- Branch -->
  <svg v-else-if="name === 'branch'" :width="size" :height="size" viewBox="0 0 16 16"
       fill="none" stroke="currentColor" :stroke-width="stroke" stroke-linecap="square" stroke-linejoin="miter">
    <circle cx="4" cy="3" r="1.4" />
    <circle cx="4" cy="13" r="1.4" />
    <circle cx="12" cy="6" r="1.4" />
    <path d="M4 4.4v7.2M5.4 6h2A3 3 0 0 1 10.4 9 3 3 0 0 0 12 6" />
  </svg>

  <!-- generic single-path -->
  <svg v-else :width="size" :height="size" viewBox="0 0 16 16"
       fill="none" stroke="currentColor" :stroke-width="stroke" stroke-linecap="square" stroke-linejoin="miter">
    <path :d="PATHS[name] ?? ''" />
  </svg>
</template>
