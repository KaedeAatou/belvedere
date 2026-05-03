// Belvedere — Demo data (Designer の data.jsx を TS 化)
// 旧プロトタイプは window.* に置いていたが Nuxt SSR 用に composable で提供

export type Status = 'TODO' | 'DOING' | 'REVIEW' | 'DONE' | 'BLOCKED';
export type TicketType = 'story' | 'bug' | 'task' | 'spike';

export interface DemoTicket {
  id: string;
  type: TicketType;
  title: string;
  actor: string | null;
  goal: string | null;
  sp: number | null;
  status: Status;
  assignee: string | null;
  sprint: string | null;
  labels: string[];
  started?: string | null;
  lastUpdate?: string | null;
  acceptance: string[];
  flags: string[];
}

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
}

export interface FlagDef {
  label: string;
  sev: 'warn' | 'err';
  desc: string;
}

export const TEAM: TeamMember[] = [
  { id: 'u1', name: 'Asai', initials: 'AS' },
  { id: 'u2', name: 'Bandō', initials: 'BD' },
  { id: 'u3', name: 'Chiba', initials: 'CB' },
  { id: 'u4', name: 'Doi', initials: 'DO' },
  { id: 'u5', name: 'Endo', initials: 'EN' },
  { id: 'u6', name: 'Fujita', initials: 'FJ' },
];

export const STATUSES: Status[] = ['TODO', 'DOING', 'REVIEW', 'DONE', 'BLOCKED'];

export const TICKETS: DemoTicket[] = [
  // sprint 24 — current
  { id: 'BLV-201', type: 'story', title: '螺旋階段ナビゲーションの遷移アニメーション',
    actor: 'プロダクトユーザー', goal: '画面遷移の文脈を失わずに作業できる',
    sp: 5, status: 'DOING', assignee: 'u2', sprint: 'S24', labels: ['frontend','motion'],
    started: '2026-04-28', lastUpdate: '2026-04-30',
    acceptance: ['遷移時に階数表示がフェードイン','Esc で前画面に戻れる','reduced-motionで瞬時遷移'],
    flags: [] },
  { id: 'BLV-202', type: 'story', title: 'AI形骸化レポートの週次サマリー',
    actor: 'スクラムマスター', goal: 'チームの形骸化傾向を1画面で把握できる',
    sp: 8, status: 'DOING', assignee: 'u4', sprint: 'S24', labels: ['ai','reporting'],
    started: '2026-04-25', lastUpdate: '2026-04-26',
    acceptance: ['週ごとの指摘件数を表示'],
    flags: ['long-doing','vague-acceptance'] },
  { id: 'BLV-203', type: 'story', title: 'スプリントゴール入力UI',
    actor: null, goal: 'SMART形式でゴールを書ける',
    sp: 3, status: 'REVIEW', assignee: 'u1', sprint: 'S24', labels: ['frontend'],
    started: '2026-04-27', lastUpdate: '2026-04-30',
    acceptance: ['S/M/A/R/T のチェックリスト表示','保存時に AI が評価'],
    flags: ['no-actor'] },
  { id: 'BLV-204', type: 'bug', title: 'ドラッグ中にカードのSPが消える',
    actor: null, goal: null,
    sp: 2, status: 'REVIEW', assignee: 'u3', sprint: 'S24', labels: ['frontend','bug'],
    started: '2026-04-29', lastUpdate: '2026-04-30',
    acceptance: ['再現手順にて発生しないこと'],
    flags: [] },
  { id: 'BLV-205', type: 'task', title: 'オンボーディング動画の差し替え',
    actor: null, goal: null,
    sp: null, status: 'TODO', assignee: 'u5', sprint: 'S24', labels: ['content'],
    started: null, lastUpdate: '2026-04-22',
    acceptance: [],
    flags: ['no-points','no-acceptance','scope-creep'] },
  { id: 'BLV-206', type: 'story', title: '通知センターを開いたときの未読バッジ',
    actor: '全ユーザー', goal: '未読通知を即座に確認できる',
    sp: 2, status: 'TODO', assignee: 'u6', sprint: 'S24', labels: ['frontend'],
    started: null, lastUpdate: '2026-04-29',
    acceptance: ['未読数を上部に表示','クリックで既読','数値が0なら非表示'],
    flags: [] },
  { id: 'BLV-207', type: 'spike', title: 'WebGLでの螺旋表現の探索',
    actor: null, goal: '将来的なナビゲーション実装の基礎調査',
    sp: 3, status: 'DOING', assignee: 'u2', sprint: 'S24', labels: ['research'],
    started: '2026-04-21', lastUpdate: '2026-04-22',
    acceptance: ['技術ドキュメント1本'],
    flags: ['stale','long-doing'] },
  { id: 'BLV-208', type: 'story', title: '検索のショートカット (⌘K) を全画面で',
    actor: 'ヘビーユーザー', goal: 'キーボードのみで素早く操作したい',
    sp: 3, status: 'DONE', assignee: 'u1', sprint: 'S24', labels: ['frontend','a11y'],
    started: '2026-04-22', lastUpdate: '2026-04-29',
    acceptance: ['全画面で⌘K起動','検索結果を3カテゴリに分類','↑↓ で選択'],
    flags: [] },
  { id: 'BLV-209', type: 'task', title: 'フォントサブセット化',
    actor: null, goal: null,
    sp: 1, status: 'DONE', assignee: 'u4', sprint: 'S24', labels: ['perf'],
    started: '2026-04-23', lastUpdate: '2026-04-26',
    acceptance: ['読み込みサイズを200KB以下に'],
    flags: [] },
  { id: 'BLV-210', type: 'bug', title: 'ダークモード切替時のチラつき',
    actor: null, goal: null,
    sp: 2, status: 'BLOCKED', assignee: 'u3', sprint: 'S24', labels: ['bug'],
    started: '2026-04-26', lastUpdate: '2026-04-28',
    acceptance: ['切替時にチラつかないこと'],
    flags: ['blocked-silent'] },

  // backlog (next sprints)
  { id: 'BLV-220', type: 'story', title: 'レトロスペクティブのアクションアイテム自動抽出',
    actor: 'スクラムマスター', goal: '議論のサマリから次回への改善案を引き出す',
    sp: 8, status: 'TODO', assignee: null, sprint: null, labels: ['ai','retro'],
    acceptance: ['議事録からTODO候補を提案','採用/却下を選べる'],
    flags: [] },
  { id: 'BLV-221', type: 'story', title: 'バーンダウンチャートのリアルタイム更新',
    actor: '開発チーム', goal: '残りSPを常に把握',
    sp: 5, status: 'TODO', assignee: null, sprint: null, labels: ['frontend'],
    acceptance: ['WebSocketで5秒以内に反映'],
    flags: [] },
  { id: 'BLV-222', type: 'story', title: 'チケット間の依存可視化',
    actor: null, goal: '並列着手できるかを判断したい',
    sp: 13, status: 'TODO', assignee: null, sprint: null, labels: ['frontend','graph'],
    acceptance: [],
    flags: ['no-actor','no-acceptance','oversized'] },
  { id: 'BLV-223', type: 'task', title: 'ドキュメント整備',
    actor: null, goal: null,
    sp: null, status: 'TODO', assignee: null, sprint: null, labels: ['docs'],
    acceptance: [],
    flags: ['no-points','no-acceptance'] },
  { id: 'BLV-224', type: 'story', title: 'カスタムフィールド対応',
    actor: '管理者', goal: '組織独自の項目を追加できる',
    sp: 5, status: 'TODO', assignee: null, sprint: null, labels: ['backend'],
    acceptance: ['最大10項目','型は文字列/数値/選択'],
    flags: [] },
  { id: 'BLV-225', type: 'spike', title: 'OAuthプロバイダの選定',
    actor: null, goal: '認証基盤の比較',
    sp: 2, status: 'TODO', assignee: null, sprint: null, labels: ['research','auth'],
    acceptance: ['3社比較表'],
    flags: [] },
  { id: 'BLV-226', type: 'story', title: 'モバイル幅でのバックログ表示',
    actor: '出先メンバー', goal: 'スマホで進捗確認したい',
    sp: 5, status: 'TODO', assignee: null, sprint: null, labels: ['frontend','mobile'],
    acceptance: ['320pxで崩れない','スワイプで状態変更'],
    flags: [] },
  { id: 'BLV-227', type: 'bug', title: '日付ピッカーのタイムゾーン',
    actor: null, goal: null,
    sp: 2, status: 'TODO', assignee: null, sprint: null, labels: ['bug'],
    acceptance: ['UTC基準で保存'],
    flags: [] },
];

export const SPRINT = {
  id: 'S24',
  name: 'Sprint 24 — Spiral',
  start: '2026-04-21',
  end: '2026-05-04',
  goal: '螺旋ナビゲーションの初版を出荷し、AI形骸化チェックを4種類リリースする',
  capacity: 32,
  velocity: [22, 26, 24, 29, 31, 28],
};

export const FLAG_DEFS: Record<string, FlagDef> = {
  'no-points':        { label: 'SP未設定',         sev: 'warn', desc: '見積りがありません。プランニング前に Fibonacci で見積もってください。' },
  'no-actor':         { label: '主語なし',         sev: 'warn', desc: 'ユーザーストーリーに主語（〜として）がありません。' },
  'no-acceptance':    { label: '受け入れ条件なし',  sev: 'err',  desc: '完了の判定基準が定義されていません。' },
  'vague-acceptance': { label: '曖昧な受け入れ条件', sev: 'warn', desc: '「正しく動く」など測定不能な条件が含まれます。' },
  'stale':            { label: '停滞',             sev: 'warn', desc: '7日以上更新されていません。' },
  'oversized':        { label: '過大',             sev: 'err',  desc: 'SP > 8。分割を検討してください。' },
  'no-goal-link':     { label: 'ゴール未紐付',      sev: 'warn', desc: 'スプリントゴールへの貢献が不明です。' },
  'scope-creep':      { label: 'スコープ追加',      sev: 'warn', desc: 'スプリント開始後に追加されました。' },
  'long-doing':       { label: 'DOING長期化',      sev: 'err',  desc: 'DOINGに2日以上滞留しています。' },
  'blocked-silent':   { label: 'ブロック理由なし',   sev: 'err',  desc: 'BLOCKED ですが理由が記録されていません。' },
  'missing-owner':    { label: '担当未割当',        sev: 'warn', desc: 'アサイニーが未設定です。' },
};

export interface ScreenDef { id: ScreenId; label: string; floor: string }
export type ScreenId = 'backlog' | 'planning' | 'daily' | 'review' | 'retro';

export const SCREENS: ScreenDef[] = [
  { id: 'backlog',  label: 'Backlog',         floor: '00' },
  { id: 'planning', label: 'Sprint Planning', floor: '01' },
  { id: 'daily',    label: 'Daily Scrum',     floor: '02' },
  { id: 'review',   label: 'Sprint Review',   floor: '03' },
  { id: 'retro',    label: 'Retrospective',   floor: '04' },
];

export interface CeremonyDef { id: ScreenId; label: string; floor: string; sub: string }

export const CEREMONIES: CeremonyDef[] = [
  { id: 'planning', label: 'Sprint Planning', floor: '01', sub: 'Sprint kickoff' },
  { id: 'daily',    label: 'Daily Scrum',     floor: '02', sub: 'Daily sync' },
  { id: 'review',   label: 'Sprint Review',   floor: '03', sub: 'Demo' },
  { id: 'retro',    label: 'Retrospective',   floor: '04', sub: 'Inspect & adapt' },
];

export function useDemoData() {
  const tickets = ref<DemoTicket[]>(structuredClone(TICKETS));
  const moveTicket = (id: string, status: Status) => {
    tickets.value = tickets.value.map((t) =>
      t.id === id ? { ...t, status, lastUpdate: '2026-04-30' } : t,
    );
  };
  return { tickets, moveTicket };
}
