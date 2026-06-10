# Belvedere — 開発プロセス

> Claude Code の機能を最大活用してハッカソン 30 日を回すためのプロセス定義 (2026-06-10 制定)。
> 提出 7/10 23:59、提出後コード作業ゼロ方針。

---

## 4 領域 × Claude Code 機能マトリクス

| 領域 | 使う機能 | 使い方 |
|---|---|---|
| **設計** | `Plan tool` + `architecture-consistency-checker` subagent | 複雑実装前に 2-3 案 + トレードオフ比較、新機能追加で docs↔code 乖離を監査 |
| **実装** | `Subagent` 並列起動 + `Task dependencies` | 独立ユニットを 3-5 agent 並列、addBlocks/addBlockedBy で可視化 |
| **テスト** | `vitest` 単体 + Playwright e2e + 失敗時自動チケット起票 | 単体 89/89 緑維持、e2e は CI で自動、ハッカソン B-1 ドッグフード |
| **CI/CD** | GitHub Actions + Hook 拡充 + 自動チケット起票 | deploy 後 e2e、失敗時 Belvedere 自身に起票、AI Agent が翌朝分析 |
| **横断** | `prompt-quality-reviewer` / `mock-llm-reviewer` 自動起動 | prompts.ts / mock.ts 編集時に hook で発火 |

---

## 設計フェーズ

```
1. 複雑実装 (新パッケージ / 新エンドポイント群 / 設計判断あり) の前に Plan tool で 2-3 案
   - 軸: 工数 / 拡張性 / 保守性 / ハッカソンスコープ適合性
   - 横断的論点 (依存外部リソース、移行コスト) も Plan に含める
   - 5 分の Plan で後の手戻り 30 分以上が消える

2. 設計確定後、`architecture-consistency-checker` subagent で docs↔code 整合性監査
   - 新パッケージ追加 → ARCHITECTURE.md 更新が必要か
   - 既存 entity 拡張 → DATA_MODEL.md / schemas.ts drift check

3. ハッカソン要件への影響がある場合 `hackathon-compliance-auditor` subagent で確認
   - 個人参加要件 / Cloud Run + Gemini + ADK 採用要件 / 公開 GitHub 要件
```

---

## 実装フェーズ

```
1. 設計を Task で分解、依存関係を addBlocks/addBlockedBy で明示
   - 並列可能ユニット = 「addBlockedBy なし」のタスク
   - 並列実行はそれらを Agent tool で同時に subagent_type=general-purpose に分業

2. Subagent 並列起動の基準
   - 3 ファイル以上の独立した実装 → 並列起動の価値あり
   - 同一ファイル内の小修正 → 直接 Edit/Write の方が速い
   - 試行錯誤が必要な実装 → 直接 (subagent には伝えにくい)

3. 1 commit = 1 論理変更を厳守 (belvedere-commit skill 経由)
   - 「時間優先で bundle」例外条項は削除済 (2026-06-08)

4. 編集後の hook 駆動
   - ts-typecheck.sh (PostToolUse:Edit/Write) で .ts 編集後自動 typecheck
   - seed-guard.sh (PreToolUse:Edit/Write) で seed 編集 block (正当性宣言時のみ heredoc 経由)
```

---

## テストフェーズ

```
1. 単体テスト (vitest)
   - 全 handler / repo / 純粋関数で 100% 近いカバレッジ目標
   - test 緑を typecheck 緑と同じレベルの不可侵基準として扱う

2. e2e テスト (Playwright)
   - deploy 後の Cloud Run 環境を実ブラウザで操作
   - Firebase Auth は custom token で OAuth 回避
   - 失敗時に POST /api/tickets で Belvedere 自身にチケット自動起票 (ドッグフード閉ループ)
   - Stage 1 (今夜) / Stage 2 (Phase 1-C 中) / Stage 3 (Phase 3 余裕あれば) で段階拡張

3. e2e の workspace 戦略
   - Stage 1: owner@example.com の ws-belvedere 共用 (allowlist 既存活用)
   - Stage 2+: robot-e2e@belvedere.test → ws-e2e-test owner で分離 (本番 seed 汚染回避)
```

---

## CI/CD フェーズ

```
1. GitHub Actions
   - push → deploy-api.yml / deploy-web.yml で自動 deploy (Cloud Run)
   - deploy 完了後 e2e.yml が workflow_run トリガで自動起動
   - e2e 失敗 → Belvedere に「[E2E Failure] <test 名>」チケット起票
   - 翌朝 Daily / Refinement Agent が拾う流れに乗る

2. CI 失敗時の自動チケット起票
   - title: "🤖 [E2E Failure] <testName>"
   - priority: 'urgent', labels: ['e2e-failure', 'test:<name>']
   - description に GitHub Actions URL + screenshot URL + trace URL
   - createdBy: 'agent:reviewer' (AI Agent 起票として記録)
   - 重複起票防止: Stage 3 で同 testName の open チケットあれば PATCH で追記

3. WIF (Workload Identity Federation) で GitHub Actions ↔ GCP 鍵レス CI
   - Firebase Admin SDK の createCustomToken は SA 鍵が必要なので FIREBASE_SA_KEY secret 別途
```

---

## 持続的改善サイクル

```
セッション開始 (SessionStart hook):
  - 最近の CI 失敗 / 直近 commit のテスト充足度を表示
  - 使われてない subagent / skill のリマインド (4 時間 rate-limit)
  - hackathon-check 最終実行から 7 日経過判定

作業中:
  - Plan tool → Task dependencies → Subagent 並列 のサイクルを守る
  - 編集 hook が自動で typecheck / seed guard / usage 記録

セッション終了:
  - 「今回のプロセスで詰まった点」を memory に
  - 次回適用する改善案を 1 行残す
  - feature-checklist skill (Phase 1-C 中に追加予定) で漏れチェック
```

---

## 機能追加時のチェックリスト

新機能追加時に以下を必ず通す (将来 `feature-checklist` skill で半自動化):

```
□ 設計
  □ Plan tool で 2-3 案比較した?
  □ ARCHITECTURE.md / DATA_MODEL.md 更新が要らないか確認した?

□ 実装
  □ typecheck 緑?
  □ 1 commit = 1 論理変更で分割した?
  □ belvedere-commit skill で commit format 強制した?

□ テスト
  □ 単体テスト追加した? (handler / repo / 純粋関数)
  □ e2e シナリオに含めるべきか判断した? (Stage 2 以降)
  □ pnpm test の exit code を確認した? (tail だけで判断しない)

□ CI/CD
  □ GitHub Actions が緑になるか push 前に確認?
  □ push 後に gh run watch で結果確認した? (post-push-check.sh hook が促す)
  □ 本番 smoke test (curl + 実ブラウザ) で確認?

□ ドキュメント
  □ ROADMAP.md の進捗反映?
  □ HACKATHON_COMPLIANCE.md §G History 追記?
  □ memory に「次回 Claude が知るべき設計判断」残した?
```

---

## 新パッケージ追加時のチェックリスト (2026-06-10 追加)

新規 `apps/*` または `packages/*` を追加する時に必ず通す:

```
□ package.json
  □ "test" script 名が既存 CI workflow と衝突しないか?
    - 単体テスト (vitest 等)  → "test" (ci.yml の pnpm -r test に巻き込まれて OK)
    - e2e / 統合テスト (重い) → "e2e" / "integration" 等の別名
    - 失敗するもの (browser 必須等) は絶対 "test" にしない
  □ "typecheck" script 必須 (pnpm typecheck で全 workspace 通る前提)

□ root の pnpm scripts 影響
  □ pnpm test を実行して、新パッケージが意図通り含まれる / 除外されるか確認
  □ pnpm typecheck も同様

□ 既存 CI workflow への影響
  □ .github/workflows/ci.yml が "pnpm -r --if-present test" を使っているか確認
  □ 失敗する可能性のあるテストは別 workflow に分離 (e2e.yml / integration.yml 等)
  □ workflow_run トリガで連鎖起動する場合、トリガ元 workflow の paths フィルタ確認

□ 新 workflow を追加する場合
  □ on.push.paths フィルタで意図したファイル変更時のみ起動するか?
  □ on.workflow_run.workflows で参照する workflow 名が正確か?
  □ permissions が最小権限か?
  □ secrets 必須なら README に明記

□ Cloud Run / GCP リソース追加
  □ infra/cloudbuild.{name}.yaml が要るか?
  □ deploy-{name}.yml が要るか?
  □ WIF SA に必要な role が揃っているか?
```

**2026-06-10 の教訓**: apps/e2e 追加時に `"test": "playwright test"` を設定したため
ci.yml の `pnpm -r --if-present test` に巻き込まれて Playwright browser 未 install で
CI 失敗。この checklist で再発防止する。

---

## 関連ドキュメント

- `CLAUDE.md` — エントリーポイント、5 儀式 + Belvedere 固有 gotcha
- `.claude/rules/project.md` — ドメイン規範 (常時 auto-load)
- `ROADMAP.md` — 30 日タイムライン + 縮退ライン
- `HACKATHON_COMPLIANCE.md` — 応募要件監査 + §G History
- `docs/PROMPTING_GUIDE.md` — Anthropic Prompting 101 ベース
- `docs/setup-firestore-rules.md` — Firestore Rules deploy 手順 (個人 GCP)
