// Belvedere チケット起票クライアント (Stage 1 / 2026-06-10)。
//
// 設計判断:
// - Stage 1 では POST /api/tickets を直接叩く最小実装
// - Stage 3 で「重複起票防止 + comment 追記」に拡張するため interface だけ切る
// - Phase 1-D で MCP HTTP 経由に切り替える時もこの interface のままで実装差し替えのみ
//
// 使い方:
//   const client = createTicketClient({ apiBaseUrl, idToken });
//   await client.createFailureTicket({ testName, runUrl, screenshotUrl, traceUrl });

export interface FailureTicketParams {
  testName: string;
  runUrl: string;          // GitHub Actions run URL
  screenshotUrl?: string;
  traceUrl?: string;
  errorMessage?: string;
}

export interface TicketClient {
  /**
   * e2e 失敗を Belvedere に起票する。
   * Stage 1: 重複検出なし、毎回新規起票 (CI 失敗 1 回 = 1 チケット、デモ素材として逆に映える)
   * Stage 3: 同 testName で open なチケットあれば comment 追記、新規起票しない
   */
  createFailureTicket(params: FailureTicketParams): Promise<{ id: string }>;
}

export interface CreateTicketClientOpts {
  apiBaseUrl: string;
  idToken: string;
}

/**
 * Stage 1 実装: 直接 POST /api/tickets を叩く。
 *
 * createdBy: 'agent:reviewer' で「AI Agent による自動起票」として記録する。
 * labels に ['e2e-failure', `test:${testName}`] を付けると Stage 3 で
 * GET /api/tickets?label=... による重複検出が容易になる。
 */
export function createTicketClient(opts: CreateTicketClientOpts): TicketClient {
  return {
    async createFailureTicket(params): Promise<{ id: string }> {
      const description = [
        `## E2E テスト失敗の自動起票 (🤖 by e2e-robot)`,
        ``,
        `**テスト名**: ${params.testName}`,
        `**GitHub Actions run**: ${params.runUrl}`,
        ...(params.errorMessage ? [`**エラー**: ${params.errorMessage}`] : []),
        ...(params.screenshotUrl ? [`**スクリーンショット**: ${params.screenshotUrl}`] : []),
        ...(params.traceUrl ? [`**Playwright trace**: ${params.traceUrl}`] : []),
        ``,
        `_Phase 1-B 自動化フロー: e2e 失敗 → Belvedere 自動起票 → 翌朝 Daily / Refinement Agent が分析_`,
      ].join('\n');

      const body = {
        title: `🤖 [E2E Failure] ${params.testName}`,
        description,
        priority: 'urgent' as const,
        status: 'todo' as const,
        valueImpact: 'high' as const,
        labels: ['e2e-failure', `test:${params.testName}`],
        acceptanceCriteria: [
          'GitHub Actions run の log を確認',
          'スクリーンショット / trace を確認して再現',
          'fix → e2e ローカル green → push',
        ],
      };

      const res = await fetch(`${opts.apiBaseUrl}/api/tickets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`failed to create ticket: ${res.status} ${res.statusText} — ${text}`);
      }

      const json = (await res.json()) as { id: string };
      return { id: json.id };
    },
  };
}
