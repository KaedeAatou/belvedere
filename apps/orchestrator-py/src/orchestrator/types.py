"""共通型 (TypeScript 側 packages/shared/src/types.ts と同期)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Status = Literal["backlog", "todo", "in-progress", "review", "done"]
Priority = Literal["low", "medium", "high", "urgent"]
ValueImpact = Literal["low", "medium", "high"]
Ritual = Literal["planning", "daily", "refinement", "review", "retrospective"]
AgentName = Literal[
    "orchestrator", "planner", "daily", "refinement", "reviewer", "retrospective"
]


class Project(BaseModel):
    id: str
    workspace_id: str = Field(alias="workspaceId")
    name: str
    id_prefix: str = Field(alias="idPrefix")
    description: str | None = None
    owner_id: str | None = Field(default=None, alias="ownerId")
    created_at: datetime = Field(alias="createdAt")


class Sprint(BaseModel):
    id: str
    number: int
    starts_at: datetime = Field(alias="startsAt")
    ends_at: datetime = Field(alias="endsAt")
    goal: str
    capacity: int
    velocity: int | None = None
    status: Literal["planned", "active", "completed", "cancelled"]


class Ticket(BaseModel):
    id: str
    project_id: str | None = Field(default=None, alias="projectId")
    title: str
    description: str | None = None
    status: Status
    priority: Priority
    value_impact: ValueImpact | None = Field(default=None, alias="valueImpact")
    ritual: Ritual | None = None
    sprint_id: str | None = Field(default=None, alias="sprintId")
    assignee_id: str | None = Field(default=None, alias="assigneeId")
    estimate_pt: int | None = Field(default=None, alias="estimatePt")
    acceptance_criteria: list[str] | None = Field(default=None, alias="acceptanceCriteria")
    labels: list[str] | None = None
    parent_ticket_id: str | None = Field(default=None, alias="parentTicketId")
    blocked_by: list[str] | None = Field(default=None, alias="blockedBy")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    created_by: str = Field(alias="createdBy")


class Epic(BaseModel):
    id: str
    project_id: str | None = Field(default=None, alias="projectId")
    name: str
    description: str | None = None
    owner_id: str | None = Field(default=None, alias="ownerId")
    status: Literal["planned", "active", "completed", "cancelled"]
    value_impact: ValueImpact | None = Field(default=None, alias="valueImpact")
    # 戦略意図 (2026-05-05 追加)
    # Refinement Agent の第6観点「戦略整合性」が rationale 欠落を検出する
    rationale: str | None = None
    success_metric: str | None = Field(default=None, alias="successMetric")
    strategic_theme: str | None = Field(default=None, alias="strategicTheme")
    created_at: datetime = Field(alias="createdAt")


class UserStory(BaseModel):
    id: str
    project_id: str | None = Field(default=None, alias="projectId")
    epic_id: str = Field(alias="epicId")
    role: str
    want: str
    so: str
    title: str
    task_ids: list[str] = Field(alias="taskIds")
    value_impact: ValueImpact | None = Field(default=None, alias="valueImpact")
