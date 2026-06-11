// AI Integrity check の生成 (Designer の buildChecks / screenIntro を移植)

import type { DemoTicket } from './useDemoData';
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
    backlog:  'バックログ全体を走査しました。SP未設定 3件、受け入れ条件なし 4件、過大チケット 1件。プランニング前に整えることを推奨します。',
    planning: 'Sprint 24 のプランを評価中。容量 32SP に対し計画 33SP、+1SPの超過。ゴール「螺旋ナビ初版」に紐付かないチケットが 1件あります。',
    daily:    'Day 8 / 14。残り 11SP。理想ライン比 −2SP の遅延。DOING長期化が 2件、ブロック未説明が 1件あります。',
    review:   '完了 18SP、未完 14SP。デモ対象は 4件、いずれも受け入れ条件を満たしています。ステークホルダー向けハイライトを下に整理しました。',
    retro:    'Sprint 24 のメトリクスから議論候補を 3つ抽出しました。前回レトロのアクション 2/3 が未実行のため再掲します。',
  };
  return m[screen];
}

export function buildChecks(screen: ScreenId, tickets: DemoTicket[]): AICheck[] {
  const out: AICheck[] = [];
  if (screen === 'backlog') {
    const noSP = tickets.filter((t) => t.flags.includes('no-points'));
    if (noSP.length)
      out.push({ tag: 'SP未設定', msg: `${noSP.length}件のチケットに見積もりがありません。Planning Pokerで合意を取りましょう。`, ref: noSP.map((t) => t.id).join(', '),
        actions: [{ label: 'Planning Poker', primary: true }, { label: '無視' }] });
    const noAcc = tickets.filter((t) => t.flags.includes('no-acceptance'));
    if (noAcc.length)
      out.push({ tag: '受け入れ条件なし', msg: `完了の定義がない ${noAcc.length}件。AIが下書きを提案できます。`, ref: noAcc[0]?.id, ticketId: noAcc[0]?.id,
        actions: [{ label: '下書きを生成', primary: true }, { label: '後で' }] });
    const oversize = tickets.filter((t) => t.flags.includes('oversized'));
    if (oversize.length)
      out.push({ tag: '過大', msg: `${oversize[0]?.id} は 13SP。INVEST原則に基づき 3-5SPに分割する案を作成できます。`, ref: oversize[0]?.id, ticketId: oversize[0]?.id,
        actions: [{ label: '分割案を生成', primary: true }] });
    const noActor = tickets.filter((t) => t.flags.includes('no-actor'));
    if (noActor.length)
      out.push({ tag: '主語なし', msg: `${noActor.length}件のストーリーに「〜として」がありません。文脈から推定して補完できます。`,
        actions: [{ label: '一括補完', primary: true }, { label: '確認しながら' }] });
  }
  if (screen === 'planning') {
    out.push({ tag: '容量超過', msg: '計画 33SP > 容量 32SP。BLV-205 または BLV-220 を次スプリントに送ることを提案します。',
      actions: [{ label: '提案を見る', primary: true }] });
    out.push({ tag: 'ゴール未紐付', msg: 'BLV-205「オンボーディング動画の差し替え」はスプリントゴールに貢献しません。', ref: 'BLV-205', ticketId: 'BLV-205',
      actions: [{ label: '次スプリントへ', primary: true }, { label: '理由を記録' }] });
    out.push({ tag: 'ゴールSMART評価', msg: 'S/M/A/R/T のうち M（測定可能）が弱い。「初版を出荷」を「Web/Mobileの2画面で公開」に書き換える案。',
      actions: [{ label: '書き換え提案', primary: true }] });
  }
  if (screen === 'daily') {
    out.push({ tag: 'DOING長期化', msg: 'BLV-207 は DOING に 10日。サブタスクへの分割か、Blockedへの遷移を推奨。', ref: 'BLV-207', ticketId: 'BLV-207',
      actions: [{ label: '分割', primary: true }, { label: 'Blockedへ' }] });
    out.push({ tag: 'ブロック理由なし', msg: 'BLV-210 は BLOCKED ですが理由が空です。何を待っていますか?', ref: 'BLV-210', ticketId: 'BLV-210',
      actions: [{ label: '理由を入力', primary: true }] });
    out.push({ tag: 'ベロシティ', msg: '理想消化に対し −2SP。Day 9-10 で1チケットを完了できれば追いつきます。' });
  }
  if (screen === 'review') {
    out.push({ tag: 'デモ準備', msg: 'BLV-208「⌘K」のデモ動画を 30秒で作成しました。プレビューを確認してください。',
      actions: [{ label: 'プレビュー', primary: true }] });
    out.push({ tag: '未完の扱い', msg: 'BLV-202 は実装中。次スプリントへキャリーオーバーするか、Spike で再見積りを推奨。', ref: 'BLV-202', ticketId: 'BLV-202',
      actions: [{ label: 'キャリーオーバー', primary: true }, { label: '再見積り' }] });
  }
  if (screen === 'retro') {
    out.push({ tag: '議論候補', msg: 'DOING長期化が 2件発生。WIP制限の導入を試したスプリントでは、平均サイクル時間が 2.1日 → 1.4日 に短縮しています。',
      actions: [{ label: 'アクションに追加', primary: true }] });
    out.push({ tag: '前回TODO未実行', msg: '前回レトロの「ペアプロを週2回」は 0/2 回でした。理由を聞きたいです。',
      actions: [{ label: '再掲', primary: true }, { label: '取り下げ' }] });
    out.push({ tag: 'ポジティブ', msg: '⌘K のリリースでチーム内利用が +60%。Keepに含めることを提案します。',
      actions: [{ label: 'Keepに追加', primary: true }] });
  }
  return out;
}
