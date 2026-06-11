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
