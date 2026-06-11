// UI 構造メタ (画面 / 儀式の定義 + flag 定義)。demo data とは独立した UI 定数。
// R3 で useDemoData から分離 (data fixture と UI メタの責務分割。useDemoData は R3 で削除)。
//
// 注意: ScreenId は 5 画面 (Backlog + 4 儀式)。T9 で 'refinement' を floor 03 に追加し
// Review→04 / Retro→05 に振り直す予定。

export type ScreenId = 'backlog' | 'planning' | 'daily' | 'review' | 'retro';

export interface ScreenDef {
  id: ScreenId;
  label: string;
  floor: string;
}

export interface CeremonyDef {
  id: ScreenId;
  label: string;
  floor: string;
  sub: string;
}

export interface FlagDef {
  label: string;
  sev: 'warn' | 'err';
  desc: string;
}

export const SCREENS: ScreenDef[] = [
  { id: 'backlog', label: 'Backlog', floor: '00' },
  { id: 'planning', label: 'Sprint Planning', floor: '01' },
  { id: 'daily', label: 'Daily Scrum', floor: '02' },
  { id: 'review', label: 'Sprint Review', floor: '03' },
  { id: 'retro', label: 'Retrospective', floor: '04' },
];

export const CEREMONIES: CeremonyDef[] = [
  { id: 'planning', label: 'Sprint Planning', floor: '01', sub: 'Sprint kickoff' },
  { id: 'daily', label: 'Daily Scrum', floor: '02', sub: 'Daily sync' },
  { id: 'review', label: 'Sprint Review', floor: '03', sub: 'Demo' },
  { id: 'retro', label: 'Retrospective', floor: '04', sub: 'Inspect & adapt' },
];

// 暫定フラグ定義 (FlagPill の見た目)。computeLocalFlags の key に対応 (useFlags.ts)。
// T5-3 で findings (ルールエンジン) ベースに置換予定。
export const FLAG_DEFS: Record<string, FlagDef> = {
  'no-points': { label: 'SP未設定', sev: 'warn', desc: '見積りがありません。プランニング前に Fibonacci で見積もってください。' },
  'no-actor': { label: '主語なし', sev: 'warn', desc: 'ユーザーストーリーに主語（〜として）がありません。' },
  'no-acceptance': { label: '受け入れ条件なし', sev: 'err', desc: '完了の判定基準が定義されていません。' },
  'vague-acceptance': { label: '曖昧な受け入れ条件', sev: 'warn', desc: '「正しく動く」など測定不能な条件が含まれます。' },
  stale: { label: '停滞', sev: 'warn', desc: '7日以上更新されていません。' },
  oversized: { label: '過大', sev: 'err', desc: 'SP > 8。分割を検討してください。' },
  'no-goal-link': { label: 'ゴール未紐付', sev: 'warn', desc: 'スプリントゴールへの貢献が不明です。' },
  'scope-creep': { label: 'スコープ追加', sev: 'warn', desc: 'スプリント開始後に追加されました。' },
  'long-doing': { label: 'DOING長期化', sev: 'err', desc: 'DOINGに2日以上滞留しています。' },
  'blocked-silent': { label: 'ブロック理由なし', sev: 'err', desc: 'BLOCKED ですが理由が記録されていません。' },
  'missing-owner': { label: '担当未割当', sev: 'warn', desc: 'アサイニーが未設定です。' },
};
