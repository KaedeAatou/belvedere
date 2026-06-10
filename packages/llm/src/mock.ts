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

function detectRole(messages: LLMMessage[]): AgentRole {
  const sys = messages.find((m) => m.role === 'system')?.content ?? '';
  // buildSystemPrompt (packages/agent/src/prompts.ts) は `Your role: <Role>` 形式で
  // role を埋め込むので、それを anchor に判定する。
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
          { topic: 'Sprint 13 容量計画 (Capacity 32pt / Selected 24pt)', source: 'agent', durationMin: 6 },
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
        '  3. Sprint 13 容量計画 (Capacity 32pt / Selected 24pt) (6min)',
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
