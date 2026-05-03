"""Belvedere Orchestrator (FastAPI)."""

from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .agents import INSTRUCTIONS, build_agents

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("belvedere.orchestrator")

app = FastAPI(title="Belvedere Orchestrator", version="0.0.1")

# ===== 環境スイッチ =====
# USE_REAL_ADK=true で ADK + Gemini を使う (GCPセットアップ完了後)。
# 未設定ならプレースホルダ応答を返すモック動作。
USE_REAL_ADK = os.getenv("USE_REAL_ADK", "false").lower() == "true"
AGENTS = build_agents(use_real_adk=USE_REAL_ADK)


# ===== Routes =====
@app.get("/")
def root() -> dict[str, Any]:
    return {"name": "belvedere-orchestrator", "version": "0.0.1", "use_real_adk": USE_REAL_ADK}


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "agents": list(AGENTS.keys()),
        "use_real_adk": USE_REAL_ADK,
        "gcp_project": os.getenv("GOOGLE_CLOUD_PROJECT"),
    }


class InvokeBody(BaseModel):
    prompt: str
    sprint_id: str | None = None


@app.post("/agents/{name}/invoke")
async def invoke(name: str, body: InvokeBody) -> dict[str, Any]:
    if name not in AGENTS:
        raise HTTPException(status_code=400, detail=f"unknown agent: {name}")

    if not USE_REAL_ADK:
        # スタブ応答 — 実装は USE_REAL_ADK=true 時に ADK Runner を呼び出す
        return {
            "agent": name,
            "stub": True,
            "instruction_excerpt": INSTRUCTIONS[name].strip().splitlines()[1].strip(),
            "echo_prompt": body.prompt,
            "note": "GCPセットアップ完了 + USE_REAL_ADK=true で本物の Gemini 推論が走ります。",
        }

    # 本物 ADK 実装プレースホルダ
    raise HTTPException(status_code=501, detail="ADK実装は GCP セットアップ後に有効化します。")
