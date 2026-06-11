// UI 構造メタ (画面 / 儀式の定義 + flag 定義)。demo data とは独立した UI 定数。
// R3 で useDemoData から分離 (data fixture と UI メタの責務分割。useDemoData は R3 で削除)。
//
// 注意: ScreenId は 5 画面 (Backlog + 4 儀式)。T9 で 'refinement' を floor 03 に追加し
// Review→04 / Retro→05 に振り直す予定。

export type ScreenId = 'backlog' | 'planning' | 'daily' | 'refinement' | 'review' | 'retro';

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

export const SCREENS: ScreenDef[] = [
  { id: 'backlog', label: 'Backlog', floor: '00' },
  { id: 'planning', label: 'Sprint Planning', floor: '01' },
  { id: 'daily', label: 'Daily Scrum', floor: '02' },
  { id: 'refinement', label: 'Backlog Refinement', floor: '03' },
  { id: 'review', label: 'Sprint Review', floor: '04' },
  { id: 'retro', label: 'Retrospective', floor: '05' },
];

// CLAUDE.md の 5 儀式表と一致 (01 Planning / 02 Daily / 03 Refinement / 04 Review / 05 Retro)
export const CEREMONIES: CeremonyDef[] = [
  { id: 'planning', label: 'Sprint Planning', floor: '01', sub: 'Sprint kickoff' },
  { id: 'daily', label: 'Daily Scrum', floor: '02', sub: 'Daily sync' },
  { id: 'refinement', label: 'Backlog Refinement', floor: '03', sub: 'Groom & estimate' },
  { id: 'review', label: 'Sprint Review', floor: '04', sub: 'Demo' },
  { id: 'retro', label: 'Retrospective', floor: '05', sub: 'Inspect & adapt' },
];
