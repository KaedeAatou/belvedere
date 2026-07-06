// AI Integrity panel の汎用ガイダンス生成。
//
// チケット単位の具体的な指摘は finding ピル (TicketRow / DailyScreen) と Refinement
// ワークキュー画面 (T9) が担うため、本パネルは画面ごとの汎用的な観点を提示する。

import type { Ticket } from '@belvedere/shared';
import type { ScreenId } from './useUiMeta';

// アクションボタンの挙動 (WC-f17989df: 従来はラベルだけで @click 未配線 = 無反応だった)。
//   - navigate: 別画面へ遷移 (例: backlog の「Refinement へ」)。target に遷移先 ScreenId。
//   - prompt:   Integrity AI チャットに定型プロンプトを投入して実行 (例: daily の「滞留を抽出」)。
export interface AICheckAction {
  label: string;
  primary?: boolean;
  kind: 'navigate' | 'prompt';
  target?: ScreenId; // kind==='navigate'
  prompt?: string; // kind==='prompt'
}

export interface AICheck {
  tag: string;
  msg: string;
  ref?: string;
  ticketId?: string;
  actions?: AICheckAction[];
}

export function screenIntro(screen: ScreenId): string {
  const m: Record<ScreenId, string> = {
    backlog:  'バックログ全体を走査しました。各チケットの品質指摘は行内のピルに表示しています。プランニング前に整えることを推奨します。',
    planning: 'スプリント計画を点検中。velocity 比較とゴール紐付け、見積もりの粒度を確認しましょう。',
    daily:    '進行中チケットの滞留とベロシティ乖離を監視しています。',
    refinement: 'バックログの指摘をルール別に整理しました。上から潰すと品質スコアが上がります。',
    review:   '完了チケットと受け入れ条件の充足を確認しています。デモ対象を下に整理しました。',
    retro:    'スプリントのメトリクスから議論候補を抽出します。',
    events:   'スプリントの状態を一覧しています。ステータス別件数・バーンダウン・停滞チケットを確認し、左のレールから各儀式に入れます。',
    'sprint-history': '完了したスプリントの実績 (ベロシティ・完了チケット数) を振り返れます。各スプリントを選ぶと当時のチケットを確認できます。',
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
      actions: [{ label: 'Refinement へ', primary: true, kind: 'navigate', target: 'refinement' }],
    });

  if (screen === 'planning')
    out.push({
      tag: '計画点検',
      msg: '計画 SP の積み上げを velocity 実績と比較中。過剰計画になっていないか、各チケットがゴールに貢献するかを確認しましょう。',
      actions: [{
        label: '提案を見る', primary: true, kind: 'prompt',
        prompt: '現在のスプリント計画を点検して。計画 SP の積み上げを velocity 実績と比較し、過剰計画かどうか、各チケットが Sprint Goal に貢献するかを診断して改善を提案して。',
      }],
    });

  if (screen === 'daily')
    out.push({
      tag: '滞留監視',
      msg: 'in-progress に長く留まるチケットは、サブタスクへの分割かブロッカーの記録を推奨します。',
      actions: [{
        label: '滞留を抽出', primary: true, kind: 'prompt',
        prompt: 'in-progress に長く滞留しているチケットを抽出して。各チケットについてサブタスクへの分割かブロッカーの記録を提案して。',
      }],
    });

  if (screen === 'refinement')
    out.push({
      tag: 'グルーミング',
      msg: 'SP 未見積もりのストーリーは「ポーカー開始」で合意形成できます。種別なし・DoD 欠落も上から解消しましょう。',
      actions: [{
        label: '上位5件を提案', primary: true, kind: 'prompt',
        prompt: 'バックログの品質で今すぐ直すべき最重要の指摘を上位5件だけ、1件1行で簡潔に教えて。観点(粒度SP>8/依存/valueImpact/priority×valueImpactミスマッチ/SP分散/Epic.rationale欠落)は内部判断に使うだけで、該当チケットの全列挙はしないで。何から着手すべきかが一目で分かる形にして。',
      }],
    });

  if (screen === 'review')
    out.push({
      tag: 'デモ準備',
      msg: '完了チケットのデモシナリオを準備できます。受け入れ条件の充足も確認します。',
      actions: [{
        label: 'デモ台本を生成', primary: true, kind: 'prompt',
        prompt: '完了チケットのデモシナリオ(台本)を生成して。各チケットの受け入れ条件が満たされているかも確認して。',
      }],
    });

  if (screen === 'retro')
    out.push({
      tag: '議論候補',
      msg: 'スプリントのメトリクスから Keep / Problem / Try の候補を提案できます。',
      actions: [{
        label: 'アクションに追加', primary: true, kind: 'prompt',
        prompt: 'このスプリントのメトリクスから Keep / Problem / Try の候補を抽出して。特に次スプリントに転記すべき Try を提案して。',
      }],
    });

  return out;
}
