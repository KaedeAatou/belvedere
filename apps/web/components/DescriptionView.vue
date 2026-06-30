<script setup lang="ts">
// 説明テキストの表示 (WC-a8f0be16)。`![](/api/images/<id>)` を <ApiImage> に、それ以外は素のテキストに
// 分割描画する。レンダリング対象は /api/images/ 参照のみ (我々のエンドポイント) なので任意 HTML/URL を
// 描画せず XSS にならない。markdown 全般はサポートしない (画像参照だけの最小実装)。
const props = defineProps<{ text: string }>();

type Seg = { t: 'text'; v: string } | { t: 'img'; id: string };
// 画像 id は image-handlers の安全集合 [a-zA-Z0-9._-] に限定 (任意パスを描画させない)。
const IMG_RE = /!\[[^\]]*\]\(\/api\/images\/([a-zA-Z0-9._-]+)\)/g;

const segments = computed<Seg[]>(() => {
  const text = props.text ?? '';
  const out: Seg[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  IMG_RE.lastIndex = 0;
  while ((m = IMG_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    out.push({ t: 'img', id: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
});
</script>

<template>
  <div class="desc-view" data-testid="description-view">
    <template v-for="(s, i) in segments" :key="i">
      <span v-if="s.t === 'text'" class="desc-text">{{ s.v }}</span>
      <ApiImage v-else :id="s.id" />
    </template>
  </div>
</template>

<style scoped>
.desc-view { font-size: 13.5px; line-height: 1.6; color: var(--ink-0); }
.desc-text { white-space: pre-wrap; }
</style>
