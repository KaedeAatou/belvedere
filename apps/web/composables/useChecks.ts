// AI Integrity check の生成 (R3 で shared Ticket + computeLocalFlags ベースに移行)。
//
// backlog は live チケットから computeLocalFlags で実集計する。他画面は架空 ID を出さない
// 汎用ガイダンス (本格的な finding ベース表示は T5 / T9 で導入)。

import type { Ticket } from '@belvedere/shared';
import type { ScreenId } from './useUiMeta';
import { computeLocalFlags } from './useFlags';

export interface AICheck {
  tag: string;
  msg: string;
  ref?: string;
  ticketId?: string;
  actions?: { label: string; primary?: boolean }[];
}

export function screenIntro(screen: ScreenId): string {
  const m: Record<ScreenId, string> = {
    backlog:  'バックログ全体を走査しました。チケット品質の指摘を下にまとめています。プランニング前に整えることを推奨します。',
    planning: 'スプリント計画を点検中。容量とゴール紐付け、見積もりの粒度を確認しましょう。',
    daily:    '進行中チケットの滞留とベロシティ乖離を監視しています。',
    review:   '完了チケットと受け入れ条件の充足を確認しています。デモ対象を下に整理しました。',
    retro:    'スプリントのメトリクスから議論候補を抽出します。',
  };
  return m[screen];
}

export function buildChecks(screen: ScreenId, tickets: Ticket[]): AICheck[] {
  const out: AICheck[] = [];

  if (screen === 'backlog') {
    const withFlags = tickets.map((t) => ({ t, flags: computeLocalFlags(t) }));

    const noSP = withFlags.filter((x) => x.flags.includes('no-points'));
    if (noSP.length)
      out.push({
        tag: 'SP未設定',
        msg: `${noSP.length}件のチケットに見積もりがありません。Planning Pokerで合意を取りましょう。`,
        ref: noSP.map((x) => x.t.id).join(', '),
        actions: [{ label: 'Planning Poker', primary: true }, { label: '無視' }],
      });

    const noAcc = withFlags.filter((x) => x.flags.includes('no-acceptance'));
    if (noAcc.length)
      out.push({
        tag: '受け入れ条件なし',
        msg: `完了の定義がない ${noAcc.length}件。AIが下書きを提案できます。`,
        ref: noAcc[0]!.t.id,
        ticketId: noAcc[0]!.t.id,
        actions: [{ label: '下書きを生成', primary: true }, { label: '後で' }],
      });

    const oversize = withFlags.filter((x) => x.flags.includes('oversized'));
    if (oversize.length)
      out.push({
        tag: '過大',
        msg: `${oversize[0]!.t.id} は ${oversize[0]!.t.estimatePt}SP。INVEST原則に基づき 3-5SPに分割する案を作成できます。`,
        ref: oversize[0]!.t.id,
        ticketId: oversize[0]!.t.id,
        actions: [{ label: '分割案を生成', primary: true }],
      });

    const missingOwner = withFlags.filter((x) => x.flags.includes('missing-owner'));
    if (missingOwner.length)
      out.push({
        tag: '担当未割当',
        msg: `${missingOwner.length}件のチケットにアサイニーがありません。文脈から推定して補完できます。`,
        actions: [{ label: '割当を提案', primary: true }, { label: '確認しながら' }],
      });
  }

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
