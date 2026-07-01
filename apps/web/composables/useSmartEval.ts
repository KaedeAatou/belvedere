// Sprint Goal の SMART 評価 (WC-14 / 旧 WC-2665bb65)。
// Planning 画面の SMART 行はハードコードの飾りだったのを、AI 実評価で動的化する。
// POST /api/planning/smart で active スプリントの Goal を LLM が 5観点 (S/M/A/R/T) で採点し、
// 各観点の ok/weak + 改善提案 (note) + summary を返す。契約は apps/api の SmartVerdict をミラー。

export type SmartLetter = 'S' | 'M' | 'A' | 'R' | 'T';

export interface SmartCriterion {
  letter: SmartLetter;
  name: string;
  ok: boolean;
  note: string;
}

export interface SmartVerdict {
  goal: string;
  criteria: SmartCriterion[];
  summary?: string;
}

export const useSmartEval = () => {
  const api = useApiClient();
  // 画面をまたいで保持する必要はないが、AI パネル等と共有しうるので useState にする。
  const verdict = useState<SmartVerdict | null>('smart-verdict', () => null);
  const loading = useState<boolean>('smart-loading', () => false);
  const error = useState<string | null>('smart-error', () => null);

  async function evaluate(): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      verdict.value = await api.post<SmartVerdict>('/api/planning/smart', {});
    } catch (e) {
      error.value = apiErrorMessage(e);
    } finally {
      loading.value = false;
    }
  }

  return { verdict, loading, error, evaluate };
};
