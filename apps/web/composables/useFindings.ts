// finding (ルールエンジン 17 ルール) 取得 composable (T5-3 / 2026-06-11)。
//
// GET /api/findings?ceremony=... を叩き、ticketId → TicketFinding[] の索引を useState で共有する。
// Backlog の行内 finding ピル (T5-3) と Refinement ワークキュー画面 (T9) の両方が再利用する。
//
// TicketFinding は packages/tools 由来だが web は @belvedere/shared のみ依存のため、
// web↔api 境界型としてここでローカル定義する (JSON レスポンス形と一致)。
//
// 注意: useState には Map ではなく Record を使う (Nuxt の SSR payload シリアライズ互換のため)。

export type FindingSeverity = 'error' | 'warn' | 'info';

export interface TicketFinding {
  ruleId: string;
  ticketId: string;
  severity: FindingSeverity;
  message: string;
  action?: { kind: string; label: string };
}

/**
 * ruleId → 行内バッジ用の短ラベル (17 ルール)。
 * ホバー不要で読める短文を優先 (C 案)。詳細は finding.message を title 属性に出す。
 */
export const RULE_LABELS: Record<string, string> = {
  TYPE_MISSING: '種別なし',
  TASK_NO_PARENT: '親Story無',
  TASK_STALL: '停滞',
  STORY_DOD_MISSING: 'DoDなし',
  STORY_DOD_PROCEDURAL: 'DoD手続き的',
  STORY_SP_MISSING: 'SP未定',
  STORY_STALL: '停滞',
  SPIKE_NO_TIMEBOX: 'timebox未設定',
  SPIKE_TIMEBOX_OVER: 'timebox超過',
  SPIKE_DOD_NOT_DECISION: '結論なし',
  BUG_NO_REPRO: '再現手順なし',
  BUG_NO_REGRESSION_DOD: '回帰テストなし',
  INCIDENT_ACTIVE: '対応中',
  INCIDENT_NO_FOLLOWUP_BUG: 'Bug未起票',
  MISMATCH_SPIKE_TITLE: 'Spike示唆',
  SPRINT_OVER_CAPACITY: '過剰計画',
  ESTIMATE_DIVERGENCE: '見積もり乖離',
};

const SEVERITY_ORDER: Record<FindingSeverity, number> = { error: 0, warn: 1, info: 2 };

/** finding の行内バッジ用ラベル。辞書に無い ruleId はそのまま表示。 */
export function findingLabel(f: TicketFinding): string {
  return RULE_LABELS[f.ruleId] ?? f.ruleId;
}

export const useFindings = () => {
  const findingsByTicket = useState<Record<string, TicketFinding[]>>('findings', () => ({}));
  const lastCeremony = useState<string>('findings-ceremony', () => 'refinement');
  const isLoading = useState<boolean>('findings-loading', () => false);
  const error = useState<string | null>('findings-error', () => null);

  const api = useApiClient();

  async function fetchFindings(ceremony = 'refinement'): Promise<void> {
    isLoading.value = true;
    error.value = null;
    lastCeremony.value = ceremony;
    try {
      const res = await api.get<{ ceremony: string; findingCount: number; findings: TicketFinding[] }>(
        `/api/findings?ceremony=${encodeURIComponent(ceremony)}`,
      );
      const map: Record<string, TicketFinding[]> = {};
      for (const f of res.findings) {
        (map[f.ticketId] ??= []).push(f);
      }
      // 行内表示は severity の悪い順 (error → warn → info)
      for (const id of Object.keys(map)) {
        map[id]!.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
      }
      findingsByTicket.value = map;
    } catch (e) {
      const err = e as { data?: { error?: string }; message?: string };
      error.value = err.data?.error ?? err.message ?? 'unknown error';
      findingsByTicket.value = {};
    } finally {
      isLoading.value = false;
    }
  }

  /** 指定チケットの finding 配列 (severity 悪い順)。 */
  function findingsFor(ticketId: string): TicketFinding[] {
    return findingsByTicket.value[ticketId] ?? [];
  }

  /** 直近の ceremony で再取得 (チケット CRUD 後に呼ぶ)。 */
  async function refresh(): Promise<void> {
    await fetchFindings(lastCeremony.value);
  }

  return { findingsByTicket, isLoading, error, fetchFindings, findingsFor, refresh, findingLabel };
};
