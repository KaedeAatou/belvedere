# 風車 Orchestrator (Python / FastAPI / ADK)

ADKでマルチエージェント本実装を行う Python サービス。
TS 側 (`apps/api`) が「ハーネスとAPIゲートウェイ」、こちらが「本物のADKマルチエージェント」を担当する想定。

## セットアップ

```bash
# uv が無ければ
brew install uv

# 依存解決
cd apps/orchestrator-py
uv sync

# 開発サーバ
uv run uvicorn orchestrator.main:app --reload --port 8081
```

## 動作確認 (ADK未接続のスタブ)

```bash
curl http://localhost:8081/health
# {"status":"ok", "agents":[...], "use_real_adk": false}

curl -X POST http://localhost:8081/agents/planner/invoke \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Sprint 13 のプランニング議題を作って"}'
```

## ADKを有効にする (GCPセットアップ後)

1. `gcloud auth application-default login`
2. 環境変数:
   ```bash
   export GOOGLE_CLOUD_PROJECT=kazaguruma-dev-2026
   export GOOGLE_CLOUD_LOCATION=asia-northeast1
   export GOOGLE_GENAI_USE_VERTEXAI=true
   export USE_REAL_ADK=true
   ```
3. `src/orchestrator/agents.py` の `build_agents` の TODO を実装
4. 再起動 → `/agents/planner/invoke` で本物の Gemini が動く

## ファイル構成

```
apps/orchestrator-py/
├── pyproject.toml
├── README.md
└── src/
    └── orchestrator/
        ├── __init__.py
        ├── main.py          # FastAPI app
        ├── agents.py        # 4儀式エージェント定義 (ADK)
        └── types.py         # 型 (Pydantic, TS側と同期)
```
