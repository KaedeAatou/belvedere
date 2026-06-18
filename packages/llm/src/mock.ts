import type { LLMMessage, LLMProvider, LLMRequest, LLMResponse, LLMToolCall } from './provider';

/**
 * Mock LLM Provider
 *
 * GCP/Geminiに繋がない状態で agent runtime の動作を確認する擬似プロバイダ。
 * System prompt から「どの儀式エージェントか」を識別し、それぞれ別の Tool 呼び出し戦略 +
 * 別の最終応答を返す。本物の Gemini に差し替えても同じインタフェースで動く。
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';

  // 状態: 同じ会話で同じツールを2回呼ばないようにする (sessionKey ベース)。
  // apps/api と apps/mcp-server では const llm = createLLMProvider(...) で
  // module singleton として保持されるため、長時間動作する Cloud Run instance で
  // 無制限に成長すると memory leak になる。MAX_CALLCOUNT_ENTRIES を上限に
  // FIFO eviction (Map の insertion order を利用)。
  private callCount = new Map<string, number>();
  private static readonly MAX_CALLCOUNT_ENTRIES = 200;

  async generate(req: LLMRequest): Promise<LLMResponse> {
    // Story Quality 補助 (Backlog 起票時の品質チェック / 2026-06-13)。
    // responseSchema.title === 'story_quality' なら 6 ロール判定 (detectRole) の前段で
    // 専用ヘルパに分岐する。これは儀式 agent ではなく handler 直叩きの構造化チェックなので
    // tools 計画 / detectRole 経路には一切入らない (6 ロールの既存挙動を壊さない)。
    if (isStoryQualityRequest(req)) {
      const verdict = composeStoryQuality(req);
      const text = JSON.stringify(verdict, null, 2);
      return {
        text,
        stop: { type: 'stop' },
        usage: this.fakeUsage(req, text.length),
      };
    }

    const sessionKey = req.messages.length.toString();

    // 直前が tool result なら最終応答に進む
    const last = req.messages[req.messages.length - 1];
    const justGotToolResult = last?.role === 'tool';

    const role = detectRole(req.messages);
    const toolNames = (req.tools ?? []).map((t) => t.name);

    if (!justGotToolResult && toolNames.length > 0) {
      const calls = this.planToolCalls(role, toolNames, sessionKey);
      if (calls.length > 0) {
        return {
          text: '',
          stop: { type: 'tool_calls', calls },
          usage: this.fakeUsage(req, 0),
        };
      }
    }

    const finalText = this.composeFinalAnswer(role, req);
    return {
      text: finalText,
      stop: { type: 'stop' },
      usage: this.fakeUsage(req, finalText.length),
    };
  }

  // ========== Tool 呼び出し計画 (儀式別) ==========

  private planToolCalls(role: AgentRole, toolNames: string[], sessionKey: string): LLMToolCall[] {
    const calls: LLMToolCall[] = [];
    const tryCall = (name: string, args: Record<string, unknown>): void => {
      if (toolNames.includes(name) && !this.alreadyCalled(sessionKey, name)) {
        this.markCalled(sessionKey, name);
        calls.push({ id: `call_${name}_${calls.length + 1}`, name, arguments: args });
      }
    };

    switch (role) {
      case 'planner':
        // Sprint Planning 補助: 現スプリントのチケット品質と Epic 紐付けをチェック
        tryCall('ticket.list', { sprintId: 'sprint-13' });
        tryCall('sprint.get', { id: 'sprint-13' });
        tryCall('epic.list', {});
        tryCall('ticket.quality.check', { ticketId: 'WC-105' });
        break;
      case 'refinement':
        // Backlog Refinement 補助: 次スプリント候補と全体構造を診断
        tryCall('project.list', {});
        tryCall('epic.list', {});
        tryCall('ticket.list', { sprintId: 'sprint-14' });
        tryCall('backlog.refinement.check', { sprintId: 'sprint-14' });
        break;
      case 'daily':
        // Daily Scrum 補助: 進行中チケット確認 + 品質チェック (DoD/SP/US)
        tryCall('ticket.list', { sprintId: 'sprint-13', status: 'in-progress' });
        tryCall('ticket.quality.check', { ticketId: 'WC-106' });
        break;
      case 'reviewer':
        // レビュー会前: デモシナリオ準備 (review/done チケット + メンバ一覧)
        tryCall('ticket.list', { sprintId: 'sprint-13', status: 'review' });
        tryCall('member.list', {});
        break;
      case 'retrospective':
        // ふりかえり: 前スプリント情報 + メンバ一覧 (Try owner 割当に必要) + 全チケットの品質充足率
        // prompts.ts の Retrospective Agent 責務に「member.list を参照して owner 候補を割り当て」
        // と明記されているため、戦略でも対応 tool を呼ぶ。
        tryCall('sprint.get', { id: 'sprint-12' });
        tryCall('member.list', {});
        tryCall('ticket.list', { sprintId: 'sprint-12' });
        break;
      case 'orchestrator':
        // 軽量ルーティングなのでツール呼ばずに即終了
        break;
      case 'unknown':
        // フォールバック: 全部
        tryCall('ticket.list', { sprintId: 'sprint-13' });
        tryCall('epic.list', {});
        break;
    }
    return calls;
  }

  // ========== 最終応答 (儀式別) ==========

  private composeFinalAnswer(role: AgentRole, req: LLMRequest): string {
    // 構造化スキーマ要求があれば JSON
    if (req.responseSchema) {
      return JSON.stringify(getStructuredOutput(role), null, 2);
    }
    return getNaturalOutput(role);
  }

  // ========== ヘルパー ==========

  private alreadyCalled(sessionKey: string, toolName: string): boolean {
    return this.callCount.has(`${sessionKey}:${toolName}`);
  }

  private markCalled(sessionKey: string, toolName: string): void {
    const key = `${sessionKey}:${toolName}`;
    // 容量上限を超えていれば、最も古い entry を 1 件削除してから挿入する。
    // Map は insertion order を保つので keys().next() で FIFO eviction が成立。
    if (
      !this.callCount.has(key) &&
      this.callCount.size >= MockLLMProvider.MAX_CALLCOUNT_ENTRIES
    ) {
      const oldest = this.callCount.keys().next().value;
      if (oldest !== undefined) this.callCount.delete(oldest);
    }
    this.callCount.set(key, 1);
  }

  /** テスト用: 現在の callCount サイズを覗く (本番コードからは呼ばない) */
  _callCountSize(): number {
    return this.callCount.size;
  }

  private fakeUsage(req: LLMRequest, outputLen: number) {
    const inputTokens = req.messages.reduce((acc, m) => acc + Math.ceil(m.content.length / 3), 0);
    const outputTokens = Math.ceil(outputLen / 3);
    return { inputTokens, outputTokens, costUsd: 0 };
  }
}

// ========== 役割検出 ==========
type AgentRole =
  | 'planner'
  | 'daily'
  | 'refinement'
  | 'reviewer'
  | 'retrospective'
  | 'orchestrator'
  | 'unknown';

function isRoutableRole(s: string): s is Exclude<AgentRole, 'unknown'> {
  return (
    s === 'planner' ||
    s === 'daily' ||
    s === 'refinement' ||
    s === 'reviewer' ||
    s === 'retrospective' ||
    s === 'orchestrator'
  );
}

function detectRole(messages: LLMMessage[]): AgentRole {
  const sys = messages.find((m) => m.role === 'system')?.content ?? '';
  // 1段目 (最優先): 機械可読 anchor `Agent-Id: <name>`。buildSystemPrompt
  // (packages/agent/src/prompts.ts) が先頭行に埋める AgentName リテラル (2026-06-18)。
  // Gemini フェーズで人間向け `Your role:` 文や responsibility を編集しても役割判定が
  // 静かに壊れないよう、AgentName リテラルを一次 anchor にする (行頭限定で誤検出を防ぐ)。
  const idMatch = sys.match(/^Agent-Id:[^\S\n]*([a-z]+)/im);
  if (idMatch) {
    const id = idMatch[1]!.toLowerCase();
    if (isRoutableRole(id)) return id;
  }
  // 2段目 (fallback): 人間向け `Your role: <Role>` 文を anchor に判定する。
  // 文中の incidental mention (例: Reviewer が「Daily Agent との連携を取りつつ」と
  // 書いた箇所) で誤ルーティングしないよう、'Your role: ' 直後に限定する。
  if (/Your role: Planner Agent/i.test(sys)) return 'planner';
  if (/Your role: Refinement Agent/i.test(sys)) return 'refinement';
  if (/Your role: Daily Agent/i.test(sys)) return 'daily';
  if (/Your role: Reviewer Agent/i.test(sys)) return 'reviewer';
  if (/Your role: Retrospective Agent/i.test(sys)) return 'retrospective';
  if (/Your role: Orchestrator/i.test(sys)) return 'orchestrator';
  return 'unknown';
}

// ========== 儀式別の応答テンプレ ==========

function getStructuredOutput(role: AgentRole): unknown {
  switch (role) {
    case 'planner':
      return {
        agendaItems: [
          { topic: 'Sprint 12 ふりかえり Try (3件) のレビュー', source: 'agent', durationMin: 8 },
          { topic: 'バックログ品質チェック: DoD/SP/US紐付け不足のチケット 3件', source: 'agent', durationMin: 10, ticketIds: ['WC-101', 'WC-104', 'WC-109'] },
          { topic: 'Sprint 13 計画 SP vs velocity (velocity 27pt / 計画 68pt → 過剰計画)', source: 'agent', durationMin: 6 },
          { topic: 'Epic 進捗確認: EP-1 / EP-2 / EP-3 / EP-4', source: 'agent', durationMin: 6 },
        ],
        qualityIssues: [
          { ticketId: 'WC-101', issues: ['DoD空', 'SP未定'] },
          { ticketId: 'WC-104', issues: ['User Story 紐付けなし'] },
          { ticketId: 'WC-109', issues: ['DoD空'] },
        ],
        summary: 'バックログ品質: 12件中 9件は OK、3件は要修正。Plannerが候補DoD/SPを準備しました。',
      };
    case 'refinement':
      return {
        scanned: 12,
        scannedEpics: 4,
        findings: [
          { ticketId: 'WC-106', signal: 'oversize_story', detail: 'SP=13 (>8)。3つに分割推奨: ①Eval set拡充 ②few-shot rubric ③コスト計測' },
          { ticketId: 'WC-112', signal: 'oversize_story', detail: 'SP=13 (>8)。①ダッシュボード基盤 ②トレンド線 ③Retro Agent連携 に分割推奨' },
          { ticketId: 'WC-110', signal: 'priority_value_mismatch_soft', detail: 'priority=medium だが valueImpact=high。OWASP リリースゲートはプロダクトゴール (信頼化) に直結、priority 引き上げ推奨' },
          { ticketId: 'WC-108', signal: 'unstructured_dependency', detail: 'CD分離は CB側完了が前提だが blockedBy 未設定' },
          { ticketId: 'EP-3', signal: 'strategic_intent_missing', detail: 'Epic EP-3 (デリバリーパイプラインの信頼化) に rationale (戦略意図) が未設定。配下のチケットが「何のために?」を見失う形骸化サイン。PO に確認推奨。' },
        ],
        productGoalAlignment: '価値貢献度 high のチケット: WC-103/WC-104/WC-105/WC-109/WC-110/WC-112。urgent はWC-105のみで整合。',
        summary: 'Refinement (6観点): 12 ticket / 4 epic をスキャン、5件の修正候補。粒度2件 / 優先度ミスマッチ1件 / 依存未整理1件 / 戦略意図欠落1件。',
      };
    case 'daily':
      return {
        digest: 'WIP 5件 / 進捗あり 3件 / 停滞 1件 / 品質不足 2件',
        stalls: [{ ticketId: 'WC-106', daysSilent: 3, suggestion: '林さんに blocker 確認をメンション (L2)' }],
        qualityFlags: [
          { ticketId: 'WC-101', missing: ['DoD', 'SP'] },
          { ticketId: 'WC-104', missing: ['User Story 紐付け'] },
        ],
        agentMentions: 1,
      };
    case 'reviewer':
      return {
        demoOrder: [
          { ticketId: 'WC-103', durationMin: 5, previewUrl: 'https://belvedere-pr-103-dev-asia-northeast1.run.app' },
          { ticketId: 'WC-107', durationMin: 3, previewUrl: 'https://belvedere-pr-107-prod-asia-northeast1.run.app' },
        ],
        stakeholderNotice: 'Cloud Run preview URL 2件発行済。Slack #review-stakeholders に投稿予定 (1営業日前)。',
        risks: ['WC-103 の e2e テストがまだ unstable。バックアップ録画も用意'],
      };
    case 'retrospective':
      return {
        tries: [
          { text: 'デイリーで「昨日詰まったこと」を必ず1人1つ言う', owner: 'Kaede', carryToTicket: 'WC-DAILY-S13-T1' },
          { text: 'PR を「24時間以内にレビュー」のWIP制限を試す', owner: '林', carryToTicket: 'WC-DAILY-S13-T2' },
          { text: 'プランニング会で DoD 必須チェックを入れる', owner: '大久保', carryToTicket: null },
        ],
        ceremonyHealth: { planning: 78, daily: 65, review: 82, retrospective: 70 },
        sprintTrend: 'Daily の儀式が停滞 (品質充足率の低下)。次スプリントで重点改善。',
      };
    case 'orchestrator':
      return {
        routedTo: ['planner', 'daily'],
        reason: '月曜朝なので Planner、平日なので Daily を起動。',
      };
    default:
      return { error: 'unknown role; provide system prompt with agent identity' };
  }
}

function getNaturalOutput(role: AgentRole): string {
  switch (role) {
    case 'planner':
      return [
        '【プランニング補助 (Planner / Mock)】',
        'Sprint 13 のバックログ品質を診断しました。',
        '',
        '◆ 議題候補 (4件 / 合計 30min):',
        '  1. Sprint 12 ふりかえり Try (3件) のレビュー (8min)',
        '  2. バックログ品質チェック: DoD/SP/US紐付け不足 3件 (10min) — WC-101 / WC-104 / WC-109',
        '  3. Sprint 13 計画 SP vs velocity (velocity 27pt / 計画 68pt → 過剰計画) (6min)',
        '  4. Epic 進捗確認: EP-1 / EP-2 / EP-3 / EP-4 (6min)',
        '',
        '◆ 品質要修正のチケット (AI が候補を準備):',
        '  - WC-101: DoD 候補3件と SP=3pt を提案 (L2 承認後に反映)',
        '  - WC-104: 既存 US-201 への紐付けを提案',
        '  - WC-109: DoD 候補3件を提案',
        '',
        'Plannerからの提案: 上記提案を会議の冒頭3分で承認すれば、議題2が短縮できます。',
      ].join('\n');

    case 'refinement':
      return [
        '【バックログリファインメント診断 (Refinement / Mock)】',
        '次スプリント候補 (sprint-14) ticket 12件 + Epic 4件 をスキャン。',
        '',
        '◆ 形骸化シグナル: 5件 (6観点診断)',
        '  ① 粒度過大 (SP > 8): 2件',
        '     - WC-106 [SP=13]: PRレビューLLM誤検出5%チューニング',
        '         → 分割候補: ①Eval set 拡充 ②few-shot rubric改善 ③コスト計測',
        '     - WC-112 [SP=13]: 儀式健全性ダッシュボード公開',
        '         → 分割候補: ①ダッシュボード基盤 ②トレンド線 ③Retro Agent連携',
        '',
        '  ② priority × valueImpact ミスマッチ: 1件',
        '     - WC-110 [priority=medium / valueImpact=high]',
        '         OWASP リリースゲートはプロダクトゴール (信頼化) 直結。priority を high に引き上げ推奨',
        '',
        '  ③ 依存関係未整理: 1件',
        '     - WC-108: CD分離は CB側完了が前提だが blockedBy 未設定',
        '',
        '  ⑥ 戦略意図 (Epic.rationale) 欠落: 1件 ⭐NEW',
        '     - EP-3 (デリバリーパイプラインの信頼化) に rationale 未設定',
        '       → 配下のチケットが「何のために?」を見失う形骸化サイン',
        '       → PO に確認推奨。Epic 画面で rationale / successMetric を埋める',
        '',
        '◆ プロダクトゴール整合: ',
        '  価値貢献度 high なチケット 6件 (WC-103/104/105/109/110/112)。',
        '  urgent はWC-105 のみ → priority と valueImpact の整合性は概ね良好。',
        '',
        '◆ 提案: 上記 5件を Refinement 会で議論 (15min)。すべて L2 で人間承認後に反映。',
      ].join('\n');

    case 'daily':
      return [
        '【デイリースクラム要約 (Daily / Mock)】',
        'Sprint 13 / Day 6 of 14',
        '',
        '◆ 進行中チケット: 5件 (うち urgent 1件)',
        '  - WC-105 [urgent] チケット品質スコアのヘッダ常設化 / Kaede / 進捗あり',
        '  - WC-106 [high]   PRレビューLLMチューニング / 林 / ⚠ 3日進捗なし',
        '  - WC-102 [med]    要約Bot Slack常駐 / 大久保 / 進捗あり',
        '  - WC-111 [low]    ペアプロ音声をGemini要約 / Kaede / 進捗あり',
        '  - WC-103 [high]   デモ環境 Cloud Run 統一 / 平井 / レビュー待ち',
        '',
        '◆ 警告: WC-106 が3日停滞。林さんへの blocker 確認をご相談 (L2)',
        '◆ 品質: WC-101 (DoD/SP空) / WC-104 (US紐付けなし) → Planner が候補準備済',
        '',
        '#daily チャンネルに投下しました。',
      ].join('\n');

    case 'reviewer':
      return [
        '【スプリントレビュー支援 (Reviewer / Mock)】',
        'Sprint 13 レビュー会 — 会前のデモ準備を支援',
        '',
        '◆ デモシナリオ草稿 (review/done チケット):',
        '  1. WC-103 デモ環境 Cloud Run 統一 (5min)',
        '       → preview URL: https://belvedere-pr-103-dev-asia-northeast1.run.app',
        '  2. WC-107 ベロシティ 3SP移動平均 (3min) [done]',
        '       → preview URL: https://belvedere-pr-107-prod-asia-northeast1.run.app',
        '',
        '◆ ステークホルダ通知:',
        '  Cloud Run preview URL 2件を Slack #review-stakeholders に投稿予定 (1営業日前)。',
        '',
        '◆ リスク:',
        '  - WC-103 の e2e テストがまだ unstable。バックアップ録画も用意',
        '',
        '◆ 提案: 上記デモ順を L2 (人が承認後) で確定 → ステークホルダに通知',
      ].join('\n');

    case 'retrospective':
      return [
        '【ふりかえり Try 抽出 (Retrospective / Mock)】',
        'Sprint 12 のふりかえりから 3件の Try を抽出しました。',
        '',
        '◆ Try (翌スプリントWIP転記候補):',
        '  1. 「昨日詰まったこと」をデイリーで必ず1人1つ言う',
        '       owner: Kaede / 転記先: WC-DAILY-S13-T1 (新規)',
        '  2. PR を 24時間以内にレビューする WIP制限',
        '       owner: 林 / 転記先: WC-DAILY-S13-T2 (新規)',
        '  3. プランニング会で DoD 必須チェックを入れる',
        '       owner: 大久保 / 転記先: 未定 (L2 確認)',
        '',
        '◆ 儀式の健全性スコア (Sprint 12 → 13 推移):',
        '  Planning      78 (+3)',
        '  Daily         65 (-8)  ← 要注意',
        '  Review        82 (+1)',
        '  Retrospective 70 (-2)',
        '',
        '◆ 主要トレンド: Daily の儀式が停滞中 (品質充足率の低下)。次スプリントで重点改善。',
        '',
        '◆ 提案: 上記 Try のうち 2件 を WIP に自動転記、1件 を L2 で人間確認 (大久保さん)。',
      ].join('\n');

    case 'orchestrator':
      return [
        '【Orchestrator 判定 (Mock)】',
        '',
        '時刻: 月曜 08:30',
        '判断: Planner Agent と Daily Agent を並列起動',
        '理由:',
        '  - 月曜朝 = プランニングの30分前なので Planner を起動',
        '  - 平日朝 = Daily も並行で要約準備',
        '次回: 火曜 09:55 / Daily Agent を単独起動',
      ].join('\n');

    case 'unknown':
    default:
      return [
        '【未識別エージェント (Mock)】',
        'system prompt から儀式エージェントを特定できませんでした。',
        'ヒント: buildSystemPrompt(agentName) で生成された prompt を渡してください。',
      ].join('\n');
  }
}

// ========== Story Quality 補助 (Backlog 起票時の品質チェック / 2026-06-13) ==========
//
// handler (apps/api/src/handlers/story-quality-handlers.ts) が
// responseSchema.title='story_quality' を付けて llm.generate() を tools 無しで 1 回呼ぶ。
// mock は決定的ヒューリスティックで契約形 (StoryQualityVerdict) の JSON を返す。
// 本物の gemini に差し替えても同じ JSON 形を返すので handler 側は無改修。

interface StoryQualityIssue {
  kind: 'boilerplate' | 'goal_fit';
  severity: 'warn' | 'info';
  message: string;
}

interface StoryQualityVerdict {
  ok: boolean;
  issues: StoryQualityIssue[];
  suggestion?: string;
  sprintGoal?: string;
}

interface StoryDraft {
  asA: string;
  iWant: string;
  soThat: string;
  title: string;
  goal: string;
}

/** responseSchema が story_quality 用かどうか (title または name で判定) */
function isStoryQualityRequest(req: LLMRequest): boolean {
  const s = req.responseSchema;
  if (!s) return false;
  const title = typeof s.title === 'string' ? s.title : '';
  const name = typeof s.name === 'string' ? s.name : '';
  return title === 'story_quality' || name === 'story_quality';
}

// user message に handler が埋め込むラベル付き draft をパースする。
// 形式 (story-quality-handlers.ts と契約): 各行 `asA: ...` / `iWant: ...` / `soThat: ...` /
// `title: ...` / `sprintGoal: ...`。欠落フィールドは空文字に倒す。
function parseStoryDraft(req: LLMRequest): StoryDraft {
  const userMsg = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const pick = (label: string): string => {
    // 行頭の `<label>:` を拾う (大文字小文字無視)。値は同一行の行末まで。
    // コロンの後は horizontal whitespace のみ許可 ([^\S\n])。`\s*` だと改行も食って
    // soThat が空のとき次の `title:` 行を誤って値に取り込むため (回帰防止)。
    const re = new RegExp(`^[^\\S\\n]*${label}[^\\S\\n]*:[^\\S\\n]*(.*)$`, 'im');
    const m = userMsg.match(re);
    return (m?.[1] ?? '').trim();
  };
  return {
    asA: pick('asA'),
    iWant: pick('iWant'),
    soThat: pick('soThat'),
    title: pick('title'),
    goal: pick('sprintGoal'),
  };
}

// soThat が「一般論 (価値が読み取れない定型句)」かどうか。
const BOILERPLATE_SOTHAT_PHRASES = [
  '価値を提供',
  '便利になる',
  '使いやすくなる',
  '改善する',
  '良くなる',
  'よくなる',
  '快適になる',
];

// goal と draft 本文の語の重なりを測るための簡易トークン化 (mock 用、決定的)。
// 日本語は分かち書きしないので whitespace 分割では語の重なりが検出できない
// (「品質スコア」が空白で区切られない)。そこで文字 bigram (2-gram) を採用する:
// 区切り文字を除去した連続文字列から 2 文字窓を全て抽出し、英数字は単語単位も足す。
// これは形態素解析を持ち込まずに「語の重なり」を近似する標準テクニック。
function tokenize(text: string): Set<string> {
  const cleaned = text
    .toLowerCase()
    .replace(/[、。,.\/:：「」『』()（）\[\]【】<>＜＞!！?？\-—_\s]+/g, ' ')
    .trim();
  const tokens = new Set<string>();
  for (const segment of cleaned.split(' ')) {
    if (segment.length === 0) continue;
    // 英数字のみの語は単語単位でも一致を取れるよう丸ごと追加
    if (/^[a-z0-9]+$/.test(segment) && segment.length >= 2) {
      tokens.add(segment);
    }
    // 文字 bigram (Japanese を含む全 segment)
    const chars = [...segment];
    for (let i = 0; i + 1 < chars.length; i += 1) {
      tokens.add(chars[i]! + chars[i + 1]!);
    }
  }
  return tokens;
}

function composeStoryQuality(req: LLMRequest): StoryQualityVerdict {
  const draft = parseStoryDraft(req);
  const issues: StoryQualityIssue[] = [];

  // --- (a) boilerplate 観点 ---
  if (draft.asA.length === 0) {
    issues.push({
      kind: 'boilerplate',
      severity: 'warn',
      message: '「誰が (As a)」が空です。価値を受け取る具体的なユーザー像を書いてください。',
    });
  }
  if (draft.iWant.length < 8) {
    issues.push({
      kind: 'boilerplate',
      severity: 'warn',
      message: '「何を (I want)」が漠然としています。具体的な振る舞い・操作で書いてください。',
    });
  }
  const soThatTooShort = draft.soThat.length < 12;
  const soThatGeneric = BOILERPLATE_SOTHAT_PHRASES.some((p) => draft.soThat.includes(p));
  if (draft.soThat.length === 0 || soThatTooShort || soThatGeneric) {
    issues.push({
      kind: 'boilerplate',
      severity: 'warn',
      message:
        '「なぜ (so that)」が一般論で、ユーザー価値が読み取れません。具体的な成果で書き換えてください。',
    });
  }

  // --- (b) goal_fit 観点 ---
  if (draft.goal.length > 0) {
    const goalTokens = tokenize(draft.goal);
    const draftTokens = tokenize(`${draft.title} ${draft.asA} ${draft.iWant} ${draft.soThat}`);
    let overlap = 0;
    for (const t of goalTokens) {
      if (draftTokens.has(t)) overlap += 1;
    }
    // bigram は粒度が細かく偶発一致が起きうるので、わずかな重なりは「乏しい」とみなす。
    // OVERLAP_FIT_THRESHOLD 件未満なら goal 外 (warn)、以上なら整合 (info)。
    const OVERLAP_FIT_THRESHOLD = 2;
    if (overlap < OVERLAP_FIT_THRESHOLD) {
      issues.push({
        kind: 'goal_fit',
        severity: 'warn',
        message: `現在のスプリントゴール「${draft.goal}」との関連が読み取れません。ゴール外なら次スプリント候補です。`,
      });
    } else {
      issues.push({
        kind: 'goal_fit',
        severity: 'info',
        message: 'スプリントゴールに整合しています。',
      });
    }
  }

  const ok = !issues.some((i) => i.severity === 'warn');
  const verdict: StoryQualityVerdict = { ok, issues };
  if (ok) {
    verdict.suggestion =
      'As a / I want / so that が具体的で、スプリントゴールにも沿っています。このまま起票して問題ありません。';
  } else {
    verdict.suggestion =
      'who / what / why の各欄を具体化すると、レビュー時に価値が伝わりやすくなります。';
  }
  if (draft.goal.length > 0) {
    verdict.sprintGoal = draft.goal;
  }
  return verdict;
}
