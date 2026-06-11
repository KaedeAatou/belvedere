// AI Integrity panel の汎用ガイダンス生成。
//
// チケット単位の具体的な指摘は finding ピル (TicketRow / DailyScreen) と Refinement
// ワークキュー画面 (T9) が担うため、本パネルは画面ごとの汎用的な観点を提示する。

import type { Ticket } from '@belvedere/shared';
import type { ScreenId } from './useUiMeta';

export interface AICheck {
  tag: string;
  msg: string;
  ref?: string;
  ticketId?: string;
  actions?: { label: string; primary?: boolean }[];
}

export function screenIntro(screen: ScreenId): string {
  const m: Record<ScreenId, string> = {
    backlog:  'バックログ全体を走査しました。各チケットの品質指摘は行内のピルに表示しています。プランニング前に整えることを推奨します。',
    planning: 'スプリント計画を点検中。容量とゴール紐付け、見積もりの粒度を確認しましょう。',
    daily:    '進行中チケットの滞留とベロシティ乖離を監視しています。',
    review:   '完了チケットと受け入れ条件の充足を確認しています。デモ対象を下に整理しました。',
    retro:    'スプリントのメトリクスから議論候補を抽出します。',
  };
  return m[screen];
}

// tickets は将来の集計用に受け取るが、現状パネルは汎用ガイダンスのみ (具体指摘はピル/Refinement)。
export function buildChecks(screen: ScreenId, _tickets: Ticket[]): AICheck[] {
  const out: AICheck[] = [];

  if (screen === 'backlog')
    out.push({
      tag: '品質チェック',
      msg: 'SP 未見積もり・DoD 欠落・種別なし等の指摘を各行のピルで可視化しています。Refinement で上から潰せます。',
      actions: [{ label: 'Refinement へ', primary: true }],
    });

  if (screen === 'planning')
    out.push({
      tag: '計画点検',
      msg: 'スプリント容量とゴール紐付けを点検中。計画が容量を超えないか、各チケットがゴールに貢献するかを確認しましょう。',
      actions: [{ label: '提案を見る', primary: true }],
    });

  if (screen === 'daily')
    out.push({
      tag: '滞留監視',
      msg: 'in-progress に長く留まるチケットは、サブタスクへの分割かブロッカーの記録を推奨します。',
      actions: [{ label: '滞留を抽出', primary: true }],
    });

  if (screen === 'review')
    out.push({
      tag: 'デモ準備',
      msg: '完了チケットのデモシナリオを準備できます。受け入れ条件の充足も確認します。',
      actions: [{ label: 'デモ台本を生成', primary: true }],
    });

  if (screen === 'retro')
    out.push({
      tag: '議論候補',
      msg: 'スプリントのメトリクスから Keep / Problem / Try の候補を提案できます。',
      actions: [{ label: 'アクションに追加', primary: true }],
    });

  return out;
}
