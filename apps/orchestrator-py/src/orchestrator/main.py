"""Belvedere Orchestrator (FastAPI / ADK / A2A)。

USE_REAL_ADK=false (既定): FastAPI スタブ (health + invoke エコー)。
  ADK/Gemini を import しないので CI/デモは軽量・回帰ゼロ。
USE_REAL_ADK=true: Refinement を実 ADK エージェント (google-adk 1.31) として A2A 公開
  (to_a2a が Agent Card + JSON-RPC message を生成)。Belvedere 本体 (TS) の単一窓口
  Orchestrator が A2A クライアントでこのピアを招集 (自前は本体のまま / Strangler Fig)。
"""

from __future__ import annotations

import logging
import os
from typing import Any

from .agents import INSTRUCTIONS, build_agents

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("belvedere.orchestrator")

# ===== 環境スイッチ (既定 OFF で本番ゼロ変更 / silent fallback しない) =====
USE_REAL_ADK = os.getenv("USE_REAL_ADK", "false").lower() == "true"
AGENTS = build_agents(use_real_adk=USE_REAL_ADK)


def _build_stub_app() -> Any:
    """USE_REAL_ADK=false の軽量スタブ (従来挙動 / ADK・Gemini を import しない)。"""
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel

    fast = FastAPI(title="Belvedere Orchestrator", version="0.0.1")

    class InvokeBody(BaseModel):
        prompt: str
        sprint_id: str | None = None

    @fast.get("/")
    def root() -> dict[str, Any]:
        return {"name": "belvedere-orchestrator", "version": "0.0.1", "use_real_adk": USE_REAL_ADK}

    @fast.get("/health")
    def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "agents": list(AGENTS.keys()),
            "use_real_adk": USE_REAL_ADK,
            "gcp_project": os.getenv("GOOGLE_CLOUD_PROJECT"),
        }

    @fast.post("/agents/{name}/invoke")
    async def invoke(name: str, body: InvokeBody) -> dict[str, Any]:
        if name not in AGENTS:
            raise HTTPException(status_code=400, detail=f"unknown agent: {name}")
        return {
            "agent": name,
            "stub": True,
            "instruction_excerpt": INSTRUCTIONS[name].strip().splitlines()[1].strip(),
            "echo_prompt": body.prompt,
            "note": "USE_REAL_ADK=true で Refinement の本物 ADK/A2A 経路が立ちます。",
        }

    return fast


def _build_a2a_app() -> Any:
    """USE_REAL_ADK=true: Refinement を ADK エージェントとして A2A 公開する。

    to_a2a が Agent Card (/.well-known/agent-card.json) + JSON-RPC message を生成。
    A2A クライアント (本体 Orchestrator) が message/send で Refinement を依頼する。
    """
    from google.adk.a2a.utils.agent_to_a2a import to_a2a
    from starlette.requests import Request
    from starlette.responses import JSONResponse

    host = os.getenv("A2A_HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8081"))
    a2a_app = to_a2a(AGENTS["refinement"], host=host, port=port)

    async def health(_req: Request) -> JSONResponse:
        return JSONResponse(
            {
                "status": "ok",
                "agents": ["refinement"],
                "use_real_adk": True,
                "protocol": "a2a",
                "gcp_project": os.getenv("GOOGLE_CLOUD_PROJECT"),
            }
        )

    a2a_app.add_route("/health", health, methods=["GET"])
    return a2a_app


app: Any = _build_a2a_app() if USE_REAL_ADK else _build_stub_app()
