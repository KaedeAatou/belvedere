---
name: belvedere-ticket-cycle
description: Belvedere の current sprint のチケットを MCP で取得し、明確なものは実装→デプロイ→review まで自動で回し、曖昧なものは設計を勝手に決めずユーザーに確認する。Use this skill whenever the user says サイクル回して / チケット処理して / 溜まったチケットを進めて / belvedere-ticket-cycle、または /loop で定期実行される時。ユーザーは Belvedere(画面)でチケットを書く/受け入れる(review→done)だけで、実装は本スキルが担う。
color: orange
---

# Belvedere Ticket Cycle

Belvedere を「ユーザーが指摘 (チケット起票) → AI が実装 → review → ユーザーが受け入れ (review→done)」で回すための自動サイクル。`/loop 1h /belvedere-ticket-cycle` で定期実行される想定。1 回の実行 = 「current sprint の未処理チケットを 1 巡し、明確なものを review まで上げ、曖昧なものは質問にまとめて報告」。

## 認証 / 前提
- MCP `belvedere` が本人認証 (per-user API キー: `BELVEDERE_MCP_TOKEN=blv_...` + `WORKSPACE_ID`) で接続済みであること。`mcp__belvedere__*` ツールを使う。
- ローカルセッションで実行する (git push + Cloud Run デプロイが要るため。クラウド実行は push 不可)。

## 手順 (1 サイクル)

### 1. 取得
- `mcp__belvedere__belvedere_sprint_board` で current sprint と status 別チケットを取得。
- 対象は **未処理 = `backlog` / `todo`** のチケットのみ。`in-progress`(誰かが着手中) / `review`(受け入れ待ち) / `done` は触らない。

### 2. 各チケットを triage (明確 / 曖昧)
**明確** = 要件も設計も一意に決まる (例: 表示文言の修正、明確なバリデーション追加、再現する不具合の修正)。
**曖昧** = 次のいずれかに該当 → **実装しない**:
- 要件/受け入れ条件が読み取れない、複数解釈できる
- 設計judジメント (どの画面/どのデータモデル/UX 方針) が要る
- バグだが**コード+現データで再現できない** (原因不明)
- 既存仕様・ドメイン (5 儀式 / immutable seed / velocity 基準 等 `.claude/rules/project.md`) と矛盾しうる

> 迷ったら曖昧側に倒す。**勝手に設計を決めない** (これが本スキルの肝)。

### 3. 明確なチケットを実装 → review
1. `belvedere_ticket_status_change(id, 'in-progress')`。
2. 実装。**`.claude/rules/testing.md` を厳守** (共有純粋関数は直接テスト / バグは再現テスト先行 / **UI・インタラクション変更は `local-ui-verify` で実機確認**)。種別ルール・5 儀式・命名規約は `.claude/rules/project.md`。seed 編集は原則 block。
3. `pnpm typecheck` + 関連 `pnpm test` 緑。
4. **`belvedere-commit` skill** でコミット (1 commit=1 論理変更)。
5. push → **CI / deploy / E2E の連鎖を conclusion まで確認** (全 green)。失敗したら CI 修正ループ (`autonomous-run` skill 参照)。
6. **deploy 成功後にのみ** `belvedere_ticket_status_change(id, 'review')`。
7. **`done` には絶対にしない** — 受け入れはユーザーが review→done で行う ([[feature_mcp_http_client]] のループ運用)。

### 4. 報告
1 サイクルの最後に必ず:
- ✅ review に上げたチケット (id / 何をしたか / PR or commit / デプロイ結果)
- ❓ 曖昧で着手しなかったチケット (id + **具体的な確認質問**)。ユーザーの回答を待つ。
- 触れなかったもの (in-progress/review/done) は列挙不要。

## ガードレール
- `done` への移動はしない (ユーザー専権)。
- 曖昧なら実装せず質問。**設計を勝手に確定しない**。
- immutable seed (`packages/seed/*`) を壊さない。ドメイン規範 (`.claude/rules/project.md`) を守る。
- 1 サイクルで全チケットを処理しようと無理しない。明確な分だけ確実に review へ。
- push したら必ず CI/deploy/E2E を確認してから review へ (緑でないものを review に上げない)。

## 関連
- ループ運用の土台: [[feature_mcp_http_client]] (MCP 3 認証・per-user API キー)
- 検証規律: `.claude/rules/testing.md` / 実機 UI: `local-ui-verify` skill / コミット: `belvedere-commit` skill
