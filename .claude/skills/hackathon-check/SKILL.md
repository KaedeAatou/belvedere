---
name: hackathon-check
description: DevOps × AI Agent Hackathon 2026 (最終ピッチ 2026-08-19) の応募要件チェック。公式 Notion (memory/hackathon_url.md) を一次情報として再取得し、Cloud Run / Gemini-ADK / 個人 GitHub / 個人 GCP の現状と突き合わせて HACKATHON_COMPLIANCE.md を更新し、🔴 リスクを目立つ形で警告する。Use this skill whenever the user mentions ハッカソン / hackathon / 応募要件 / コンプライアンス確認 / 公式 Notion / 中間提出 / 最終ピッチ / 動画必須 / 個人参加要件 / コスト制限 / Cloud Run 必須 / Gemini-ADK 必須、またはフェーズ移行・大きな技術スタック変更の直後 / 週次定期チェック / 7 日経過リマインダー発火時。修正提案までで止め、要件未充足を勝手に塞ぐ実装は行わない。
color: red
---

# /hackathon-check

ハッカソン応募要件の充足状況を監査して、結果を `HACKATHON_COMPLIANCE.md` に反映する。

## 起動時の動き

1. **`hackathon-compliance-auditor` Subagent を起動する** (`.claude/agents/hackathon-compliance-auditor.md`)
   - 一次情報の Notion 再取得
   - リポジトリ実状の調査
   - 差分レポート作成
2. Subagent からの報告を受け取り、要点をユーザーに日本語で示す:
   - A. 開発要件 (Cloud Run / Gemini-ADK) のステータス
   - B. 審査5基準のステータス
   - C. 参加要件のステータス
   - D. スケジュールの直近マイルストーン
   - 🔴 緊急対応すべきリスク (あれば)
   - 推奨アクション (あれば)
3. 必要に応じて `HACKATHON_COMPLIANCE.md` のステータス・履歴を更新
4. Notion 側に変更があれば、`memory/hackathon_url.md` の取得手順自体に問題がないかも確認
5. **最終チェック日付を更新**: `touch /Users/kagayayuuki/Projects/ai-agent-hackathon/.claude/.last-hackathon-check` を実行する。
   これにより SessionStart hook (`.claude/hooks/hackathon-check-reminder.sh`) が次回からの経過日数計算で使う。

## 実行頻度の目安

- 大きな技術変更直後 (LLMプロバイダ変更 / インフラ変更 / アーキ変更)
- フェーズ移行時 (`ROADMAP.md` の Phase境界)
- 週次 (毎週日曜が候補)
- ハッカソン応募方法・スケジュール公開のニュースを見たとき

## 出力例

```
## Hackathon Compliance Check (2026-04-30)

### 一次情報
- Notion 公式ページに変更なし (応募方法・スケジュール詳細は依然 Coming Soon)

### 開発要件
- A-1 Cloud Run: 🟡 計画 (Dockerfile / cloudbuild.yaml 雛形済 / 未デプロイ)
- A-2 Gemini + ADK: 🟡 計画 (factory にスタブ / orchestrator-py に雛形 / 本物未接続)

### 審査5基準
- B-1 価値の中心: 🟡 設計済、Mock LLM では 5ロール動作確認、ピッチデモ未撮影
- B-2 課題: 🟢
- B-3 ユーザビリティ: 🟡 採用UI 21 のNext.js移植未着手
- B-4 実用性: 🔴 実利用検証未着手 (Phase 3 で予定)
- B-5 実装力: 🟡 typecheck 全通 / テスト無し

### 参加要件
- 🟡 個人GCP の確認は GCPアカウント作成時に行う必要

### 直近マイルストーン
- Phase 1 期限: 2026-05-17 (Cloud Run 初回デプロイ)
- 残 17 日 / GCPセットアップが最重要クリティカルパス

### 🔴 緊急対応
- なし。ただし GCPセットアップが進まないと連鎖的に Phase 1 が遅れる

### 推奨アクション
1. ユーザー: docs/setup-gcp.md §1〜§8 を実行 (30分)
2. その後 Claude: packages/llm/ に gemini provider 実装
3. ユーザー: 初回 Cloud Run デプロイ (gcloud builds submit)
```

## 注意

- このスキルは **修正提案までで止まる**。要件未充足を勝手に塞ぐ実装変更は行わない (アーキ判断はユーザーが必要)
- Notion 取得が失敗 (ネット遮断 / Notion API 仕様変更) のときは、`HACKATHON_COMPLIANCE.md` ベースのセカンドベスト監査に切り替えて警告する
