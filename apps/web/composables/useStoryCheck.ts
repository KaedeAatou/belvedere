// User Story 品質 AI チェック composable (Wave 2 / 2026-06-13)。
//
// Backlog で User Story を起票する際、POST /api/story-quality を叩いて
// (a) フォームを埋めただけの形骸化 (boilerplate) (b) active スプリントゴール適合
// を AI (LLMProvider) に診断させる。起票はブロックせず、結果を指摘として見せる。
//
// 境界型 (StoryQualityVerdict) は web↔api の JSON レスポンス形と一致させてローカル定義する
// (TicketFinding と同じ流儀。web は @belvedere/shared のみ依存)。

export type StoryIssueKind = 'boilerplate' | 'goal_fit';
export type StoryIssueSeverity = 'warn' | 'info';

export interface StoryQualityIssue {
  kind: StoryIssueKind;
  severity: StoryIssueSeverity;
  message: string;
}

export interface StoryQualityVerdict {
  ok: boolean;
  issues: StoryQualityIssue[];
  suggestion?: string;
  sprintGoal?: string;
}

export interface StoryDraft {
  asA: string;
  iWant: string;
  soThat: string;
  title?: string;
}

export const useStoryCheck = () => {
  const api = useApiClient();
  const checking = useState<boolean>('story-check-loading', () => false);
  const error = useState<string | null>('story-check-error', () => null);

  async function checkStory(draft: StoryDraft): Promise<StoryQualityVerdict | null> {
    checking.value = true;
    error.value = null;
    try {
      const body: Record<string, unknown> = {
        asA: draft.asA.trim(),
        iWant: draft.iWant.trim(),
        soThat: draft.soThat.trim(),
        ...(draft.title !== undefined && draft.title.trim() !== '' && { title: draft.title.trim() }),
      };
      return await api.post<StoryQualityVerdict>('/api/story-quality', body);
    } catch (e) {
      const err = e as { data?: { error?: string }; message?: string };
      error.value = err.data?.error ?? err.message ?? 'unknown error';
      return null;
    } finally {
      checking.value = false;
    }
  }

  return { checkStory, checking, error };
};
