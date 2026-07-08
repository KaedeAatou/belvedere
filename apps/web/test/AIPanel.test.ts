// AIPanel + useChecks のテスト (WC-f17989df)。
// バグ: Integrity AI panel のアクションボタン (Refinement へ / 滞留を抽出 等) が @click 未配線で無反応だった。
//   - 純粋関数 unit: buildChecks が各画面のアクションに kind/target/prompt を正しく載せる。
//   - component unit: navigate はボタンクリックで @navigate emit、prompt は useAgentChat.send を呼ぶ。
import { describe, it, expect, vi } from 'vitest';
import { ref, nextTick, type Ref } from 'vue';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import { buildChecks } from '~/composables/useChecks';
import AIPanel from '~/components/AIPanel.vue';

const mocks = vi.hoisted(() => ({
  send: vi.fn((_screen: string, _prompt: string) => Promise.resolve()),
  retry: vi.fn(() => Promise.resolve()),
}));

// sendError はテストから制御できるよう共有 ref にする (エラーバナー + リトライの配線検証用)。
let sendErrorRef: Ref<string | null> | undefined;

// isSending は実 ref にする (plain object だとテンプレートで unwrap されず truthy 扱いになり
// prompt ボタンが常に disabled になってクリックが no-op になる)。
mockNuxtImport('useAgentChat', () => () => {
  sendErrorRef ??= ref<string | null>(null);
  return {
    messages: ref([]),
    isSending: ref(false),
    sendError: sendErrorRef,
    streamingDraft: ref(null),
    send: mocks.send,
    retry: mocks.retry,
    clear: vi.fn(),
  };
});

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

  // F-12 (2026-07-08): retro の旧ラベル「アクションに追加」はチャットに提案を出すだけで
  // KPT 列には何も追加しない (ラベル詐欺) だった。実態 (kind:'prompt' = 議論候補の提示) に
  // 合わせたラベルであることを固定する。KPT への自動追加は L2 自律性の設計判断が絡むため未実装。
  it('retro のアクションは「議論候補を出す」ラベルの prompt (F-12: 「アクションに追加」はラベル詐欺)', () => {
    const a = buildChecks('retro', [])[0]?.actions?.[0];
    expect(a?.label).toBe('議論候補を出す');
    expect(a?.kind).toBe('prompt');
    expect(a?.prompt).toMatch(/Keep \/ Problem \/ Try/);
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

  it('sendError があるとエラーバナー + 再試行ボタンを出し、クリックで retry を呼ぶ', async () => {
    mocks.retry.mockClear();
    const wrapper = await mountSuspended(AIPanel, { props: { screen: 'daily', tickets: [] } });
    expect(wrapper.find('[data-testid=ai-error]').exists()).toBe(false); // 初期はエラーなし
    sendErrorRef!.value = 'network down';
    await nextTick();
    expect(wrapper.find('[data-testid=ai-error]').exists()).toBe(true);
    await wrapper.find('[data-testid=ai-retry]').trigger('click');
    expect(mocks.retry).toHaveBeenCalledTimes(1);
    sendErrorRef!.value = null; // 共有 ref を後片付け (他テストに漏らさない)
  });
});
