"""orchestrator-py の ADK / A2A 構築スモーク (2026-06-25)。

実 Gemini は呼ばず、(1) build_agents の stub/real 両モード (2) Refinement の FunctionTool 装着
(3) fetch_refinement_findings の graceful 失敗と API 呼出 (4) to_a2a の A2A アプリ構築 を固定する。
USE_REAL_ADK=true でも構築段階では Gemini を呼ばないため CI で安全に回せる。
"""

from __future__ import annotations

from typing import Any

import pytest

from orchestrator import agents


def test_build_agents_stub_returns_six_placeholders() -> None:
    stub = agents.build_agents(use_real_adk=False)
    assert sorted(stub.keys()) == [
        "daily",
        "orchestrator",
        "planner",
        "refinement",
        "retrospective",
        "reviewer",
    ]
    assert stub["refinement"]["stub"] is True
    assert stub["refinement"]["model"] == "gemini-2.5-pro"


def test_build_agents_real_returns_adk_llm_agents() -> None:
    real = agents.build_agents(use_real_adk=True)
    from google.adk.agents import LlmAgent

    assert all(isinstance(a, LlmAgent) for a in real.values())
    # Refinement だけが 6観点取得の FunctionTool を装着している (他は instruction-only)。
    ref = real["refinement"]
    assert ref.name == "refinement"
    assert ref.model == "gemini-2.5-pro"
    assert [t.name for t in ref.tools] == ["fetch_refinement_findings"]
    assert real["daily"].tools == []


def test_fetch_findings_graceful_when_env_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BELVEDERE_API_URL", raising=False)
    monkeypatch.delenv("BELVEDERE_SERVICE_TOKEN", raising=False)
    out = agents.fetch_refinement_findings("sprint-14")
    assert out["findings"] == []
    assert "未設定" in out["error"]  # 推測で埋めず明示エラー


def test_fetch_findings_calls_belvedere_api(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BELVEDERE_API_URL", "https://api.example/")
    monkeypatch.setenv("BELVEDERE_SERVICE_TOKEN", "svc-token-123")
    captured: dict[str, Any] = {}

    class FakeResp:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, Any]:
            return {
                "findings": [{"ticketId": "WC-106", "signal": "oversize_story"}],
                "ruleFindings": [],
            }

    def fake_get(url: str, *, params: Any, headers: Any, timeout: Any) -> FakeResp:
        captured["url"] = url
        captured["params"] = params
        captured["headers"] = headers
        return FakeResp()

    monkeypatch.setattr(agents.httpx, "get", fake_get)
    out = agents.fetch_refinement_findings("sprint-14")
    assert captured["url"] == "https://api.example/api/refinement"  # 末尾スラッシュ正規化
    assert captured["params"] == {"sprintId": "sprint-14"}
    assert captured["headers"]["Authorization"] == "Bearer svc-token-123"  # service token 認証
    assert out["findings"][0]["ticketId"] == "WC-106"


def test_to_a2a_builds_a2a_app() -> None:
    from google.adk.a2a.utils.agent_to_a2a import to_a2a
    from starlette.applications import Starlette

    ref = agents.build_agents(use_real_adk=True)["refinement"]
    a2a_app = to_a2a(ref, host="0.0.0.0", port=8081)
    assert isinstance(a2a_app, Starlette)
