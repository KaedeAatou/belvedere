// Belvedere チケット起票クライアント (Stage 3 / 2026-06-11)。
//
// 設計判断:
// - Stage 3: 重複起票防止 + Phase 1-D MCP HTTP 切替準備
// - 同 testName で open なチケットあれば PATCH で description に追記
// - 新規起票しない → CI 失敗が連発しても 1 testName につき 1 チケットに集約
// - interface は Stage 1 と互換、Phase 1-D で MCP HTTP 経由に切り替える時も呼出側変更不要
//
// 使い方:
//   const client = createTicketClient({ apiBaseUrl, idToken });
//   await client.createFailureTicket({ testName, runUrl, ... });
//     → 内部で既存 open チケット検索 → あれば PATCH 追記、なければ POST 新規
//
// 公開 API は Stage 1 から不変 (createFailureTicket 1 つ)。
// 内部実装が「find → branch (PATCH or POST)」に変更されたのみ。

import type { Ticket } from '@belvedere/shared';

export interface FailureTicketParams {
  testName: string;
  runUrl: string;          // GitHub Actions run URL
  screenshotUrl?: string;
  traceUrl?: string;
  errorMessage?: string;
  attemptNumber?: number;  // CI 失敗の累積回数 (この testName で何回目か)
}

export interface TicketClient {
  /**
   * e2e 失敗を Belvedere に起票する。
   * Stage 3 動作:
   *   1. labels に `test:<testName>` を含む open (status != done) なチケットを検索
   *   2. あれば → そのチケットの description に「Re-fail @ <runUrl>」を追記 (PATCH)
   *   3. なければ → 新規起票 (POST)
   *
   * 戻り値の id は新規/既存どちらの場合もそのチケットの ID。
   */
  createFailureTicket(params: FailureTicketParams): Promise<{ id: string; isNew: boolean }>;
}

export interface CreateTicketClientOpts {
  apiBaseUrl: string;
  idToken: string;
}

const STATUS_OPEN: ReadonlyArray<string> = ['backlog', 'todo', 'in-progress', 'review'];

/**
 * Stage 3 実装: 重複検出 → PATCH 追記 or POST 新規。
 *
 * Phase 1-D MCP HTTP 切替時はこの関数を MCP 版に差し替える (interface は不変)。
 */
export function createTicketClient(opts: CreateTicketClientOpts): TicketClient {
  const auth = () => ({ Authorization: `Bearer ${opts.idToken}`, 'Content-Type': 'application/json' });

  return {
    async createFailureTicket(params): Promise<{ id: string; isNew: boolean }> {
      const label = `test:${params.testName}`;

      // 1. 既存 open チケット検索
      const existing = await findOpenTicketByLabel(opts.apiBaseUrl, auth(), label);

      if (existing) {
        // 2. PATCH 追記
        const newSection = renderRefailSection(params);
        const updatedDescription = `${existing.description ?? ''}\n\n${newSection}`;
        const res = await fetch(`${opts.apiBaseUrl}/api/tickets/${existing.id}`, {
          method: 'PATCH',
          headers: auth(),
          body: JSON.stringify({ description: updatedDescription }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`failed to PATCH existing ticket ${existing.id}: ${res.status} ${res.statusText} — ${text}`);
        }
        return { id: existing.id, isNew: false };
      }

      // 3. 新規起票
      const description = renderInitialDescription(params);
      const body = {
        title: `🤖 [E2E Failure] ${params.testName}`,
        description,
        priority: 'urgent' as const,
        status: 'todo' as const,
        valueImpact: 'high' as const,
        labels: ['e2e-failure', label],
        acceptanceCriteria: [
          'GitHub Actions run の log を確認',
          'artifact から screenshot / trace を DL して再現',
          'fix → e2e ローカル green → push',
          'CI で e2e が緑になることを確認',
        ],
      };

      const res = await fetch(`${opts.apiBaseUrl}/api/tickets`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`failed to create ticket: ${res.status} ${res.statusText} — ${text}`);
      }
      const json = (await res.json()) as Ticket;
      return { id: json.id, isNew: true };
    },
  };
}

/**
 * workspace 内の全 ticket から、labels に label を含み、status が open のものを 1 件返す。
 * (Belvedere API の GET /api/tickets は labels フィルタを持たないのでクライアント側 filter)
 */
async function findOpenTicketByLabel(
  apiBaseUrl: string,
  headers: Record<string, string>,
  label: string,
): Promise<Ticket | null> {
  const res = await fetch(`${apiBaseUrl}/api/tickets`, { headers });
  if (!res.ok) {
    // 取得失敗時は重複検出を諦めて新規起票に倒す (新規が大量に起きるリスクより、
    // CI 失敗が報告されない方が痛い)
    console.warn(`[ticket-client] findOpenTicketByLabel: list failed ${res.status}`);
    return null;
  }
  const tickets = (await res.json()) as Ticket[];
  for (const t of tickets) {
    if (!Array.isArray(t.labels)) continue;
    if (!t.labels.includes(label)) continue;
    if (!STATUS_OPEN.includes(t.status)) continue;
    return t;
  }
  return null;
}

function renderInitialDescription(p: FailureTicketParams): string {
  return [
    `## E2E テスト失敗の自動起票 (🤖 by e2e-robot)`,
    ``,
    `**テスト名**: ${p.testName}`,
    `**初回失敗 run**: ${p.runUrl}`,
    ...(p.errorMessage ? [`**エラー**: \`${p.errorMessage}\``] : []),
    ...(p.screenshotUrl ? [`**スクリーンショット**: ${p.screenshotUrl}`] : []),
    ...(p.traceUrl ? [`**Playwright trace**: ${p.traceUrl}`] : []),
    ``,
    `### artifact からの再現`,
    ``,
    `1. run ページの Artifacts セクションから \`playwright-results-*\` をダウンロード`,
    `2. zip 展開後、\`pnpm exec playwright show-trace <test>/trace.zip\` で trace 確認`,
    `3. \`<test>/test-failed-*.png\` で screenshot 確認`,
    ``,
    `_Phase 1-B 自動化フロー: e2e 失敗 → Belvedere 自動起票 → 翌朝 Daily / Refinement Agent が分析_`,
  ].join('\n');
}

function renderRefailSection(p: FailureTicketParams): string {
  // 同 testName での再失敗。既存 description の末尾に追記される。
  return [
    `### 🔁 再失敗`,
    ``,
    `- **run**: ${p.runUrl}`,
    ...(p.errorMessage ? [`- **エラー**: \`${p.errorMessage}\``] : []),
    `- _注: 同 testName で open な既存チケットに追記しました (重複起票防止 Stage 3)_`,
  ].join('\n');
}
