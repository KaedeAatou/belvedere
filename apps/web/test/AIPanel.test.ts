// AIPanel + useChecks のテスト (WC-f17989df)。
// バグ: Integrity AI panel のアクションボタン (Refinement へ / 滞留を抽出 等) が @click 未配線で無反応だった。
//   - 純粋関数 unit: buildChecks が各画面のアクションに kind/target/prompt を正しく載せる。
//   - component unit: navigate はボタンクリックで @navigate emit、prompt は useAgentChat.send を呼ぶ。
import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import { buildChecks } from '~/composables/useChecks';
import AIPanel from '~/components/AIPanel.vue';

const mocks = vi.hoisted(() => ({
  send: vi.fn((_screen: string, _prompt: string) => Promise.resolve()),
}));

// isSending は実 ref にする (plain object だとテンプレートで unwrap されず truthy 扱いになり
// prompt ボタンが常に disabled になってクリックが no-op になる)。
mockNuxtImport('useAgentChat', () => () => ({
  messages: ref([]),
  isSending: ref(false),
  sendError: ref(null),
  send: mocks.send,
  clear: vi.fn(),
}));

describe('buildChecks アクション配線 (WC-f17989df)', () => {
  it('backlog の「Refinement へ」は refinement へ navigate', () => {
    const a = buildChecks('backlog', [])[0]?.actions?.[0];
    expect(a?.label).toBe('Refinement へ');
    expect(a?.kind).toBe('navigate');
    expect(a?.target).toBe('refinement');
  });

  it('daily の「滞留を抽出」は prompt を持つ', () => {
    const a = buildChecks('daily', [])[0]?.actions?.[0];
    expect(a?.label).toBe('滞留を抽出');
    expect(a?.kind).toBe('prompt');
    expect(a?.prompt).toMatch(/滞留/);
  });

  it('AI 系画面のアクションは全て prompt か navigate で kind が付く (未配線ゼロ)', () => {
    for (const screen of ['backlog', 'planning', 'daily', 'refinement', 'review', 'retro'] as const) {
      for (const c of buildChecks(screen, [])) {
        for (const a of c.actions ?? []) {
          expect(['navigate', 'prompt']).toContain(a.kind);
          if (a.kind === 'navigate') expect(a.target).toBeTruthy();
          if (a.kind === 'prompt') expect(a.prompt).toBeTruthy();
        }
      }
    }
  });
});

describe('AIPanel ボタンクリック配線 (WC-f17989df)', () => {
  it('navigate アクションクリックで @navigate を emit する (send は呼ばない)', async () => {
    const wrapper = await mountSuspended(AIPanel, { props: { screen: 'backlog', tickets: [] } });
    await wrapper.find('[data-testid=ai-action-navigate]').trigger('click');
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['refinement']);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('prompt アクションクリックで useAgentChat.send(screen, prompt) を呼ぶ', async () => {
    mocks.send.mockClear();
    const wrapper = await mountSuspended(AIPanel, { props: { screen: 'daily', tickets: [] } });
    await wrapper.find('[data-testid=ai-action-prompt]').trigger('click');
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0]?.[0]).toBe('daily');
    expect(String(mocks.send.mock.calls[0]?.[1])).toMatch(/滞留/);
  });
});
