import type { RetroTry } from '@belvedere/shared';

/**
 * Retrospective の carry-forward 積み上げ (前スプリントから持ち越した Try) の seed。
 *
 * Retrospective Agent は retro.tries.list でこの積み上げを参照し、done=false の Try が
 * 今スプリントで守られたか (kept / broken) を評価する (prompts.ts の責務 step6)。さらに
 * index-tries.ts が RAG コーパス (belvedere-kb-tries-{workspaceId}) に埋め込み投入するので、
 * knowledge.search (意味検索) でも過去 Try が surface する = 継続的改善ループ (まわす軸)。
 *
 * デモ仕込み (チケット同様「最初から用意されたデータ」/ AI 挙動は変えない):
 *  - try-seed-s12-ac:      「velocity を超えて計画しない」= 継続改善ループのキラー主役。今スプリント
 *                          (S13=計画68pt / 実績velocity27) の過剰計画を Planner が SPRINT_OVER_VELOCITY で
 *                          検出し、「前回この Try を決めたのに守れていない」と数字で突く broken の主役。
 *  - try-seed-s11-blocked: 「BLOCKED 理由を書く」= 継続 Try として再掲される broken の対比。
 *
 * createdAt 昇順契約 (memory.ts / firestore.ts) に沿って古い積み上げ (S11) を先に置く。
 */
export const seedRetroTries: RetroTry[] = [
  {
    id: 'try-seed-s11-blocked',
    workspaceId: 'ws-belvedere',
    text: 'BLOCKED に遷移したら、理由をチケットに必ず書く',
    sprintNumber: 11,
    done: false,
    createdAt: '2026-04-07T18:00:00+09:00',
    createdBy: 'hirai',
  },
  {
    id: 'try-seed-s12-ac',
    workspaceId: 'ws-belvedere',
    text: 'スプリントに計画を詰め込みすぎない。計画したストーリーポイントの合計が、前スプリントの実績ベロシティを超えないようにする',
    sprintNumber: 12,
    sprintId: 'sprint-12',
    done: false,
    createdAt: '2026-04-21T18:00:00+09:00',
    createdBy: 'okubo',
  },
];
