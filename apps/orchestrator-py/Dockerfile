# Belvedere Orchestrator (ADK / A2A) — Cloud Run 用 Dockerfile。
# build context = apps/orchestrator-py (モノレポ全体は不要 / Python サービス単体)。
# USE_REAL_ADK=true で Refinement を ADK エージェントとして A2A 公開する (env は deploy 時に設定)。

FROM python:3.11-slim
WORKDIR /app

# uv (高速な Python パッケージマネージャ / ローカルと同じ uv.lock を凍結インストール)
RUN pip install --no-cache-dir uv

# 依存解決のキャッシュ層 (lock + メタのみ先にコピー)
COPY pyproject.toml uv.lock README.md ./
COPY src ./src
RUN uv sync --frozen --no-dev

ENV PYTHONUNBUFFERED=1
# Cloud Run は $PORT を注入する (既定 8080)。to_a2a / uvicorn とも $PORT を読む。
ENV PORT=8080
EXPOSE 8080

# uvicorn で ASGI app (USE_REAL_ADK=true なら A2A Starlette / false なら FastAPI スタブ) を起動。
CMD ["sh", "-c", "uv run uvicorn orchestrator.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
