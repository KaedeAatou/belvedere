// StoryPoints の用語 tooltip 配線テスト (WC-22 / 2026-07-06)。
// 「sp だけ説明が出ない」対策で、値あり/未設定いずれも Story Point の説明 title を持つことを固定する。

import { describe, it, expect } from 'vitest';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import StoryPoints from '~/components/primitives/StoryPoints.vue';

describe('StoryPoints — Story Point の説明 tooltip (WC-22)', () => {
  it('値ありは Story Point の説明 title を持つ', async () => {
    const wrapper = await mountSuspended(StoryPoints, { props: { value: 5 } });
    expect(wrapper.find('[title*="Story Point"]').exists()).toBe(true);
  });

  it('未設定 (—) も Story Point の説明 title を持つ', async () => {
    const wrapper = await mountSuspended(StoryPoints, { props: { value: null } });
    expect(wrapper.find('[title*="Story Point"]').exists()).toBe(true);
  });
});
