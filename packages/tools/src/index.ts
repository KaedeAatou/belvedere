import type { AgentTool } from '@belvedere/agent';
import { runAgent, buildRegistry, buildSystemPrompt } from '@belvedere/agent';
import type { RepoContainer } from '@belvedere/repo';
import type { AgentRun, Ritual } from '@belvedere/shared';
import { modelForAgent } from '@belvedere/shared';
import type { LLMProvider } from '@belvedere/llm';
import type { KnowledgeSearcher } from './knowledge';
import { runTicketRules, buildRuleContext } from './ticket-rules';
import { checkTicketQuality } from './quality';
import { checkBacklogRefinement } from './refinement';
import { validateInvocation, CEREMONY_AGENTS } from './agent-invoke';
import { summarizeSprintContext } from './sprint-context';

// ルールエンジンを外部 (apps/api の finding-handlers 等) からも使えるよう re-export
export {
  runTicketRules,
  buildRuleContext,
  ticketRules,
  type TicketFinding,
  type TicketRule,
  type RuleContext,
} from './ticket-rules';

// チケット品質診断の純粋関数も外部 (apps/api GET /api/tickets/:id/quality) から使えるよう re-export
export { checkTicketQuality, type TicketQualityResult } from './quality';
// バックログリファインメント 6 観点診断の純粋関数 (apps/api GET /api/refinement) も re-export。
// 観点ごとの detect* も公開し、観点単位の再利用・直接テストを可能にする (R2-F)。
export {
  checkBacklogRefinement,
  detectOversizeStory,
  detectUnstructuredDependency,
  detectValueImpactMissing,
  detectPriorityValueMismatch,
  detectSpVariance,
  detectStrategicIntentMissing,
  type BacklogRefinementInput,
  type BacklogRefinementResult,
  type RefinementSignal,
} from './refinement';

// RAG 検索層 (KnowledgeSearcher) — apps/api の createApp({repo, llm, knowledge}) 注入で使う
export {
  MockKnowledgeSearcher,
  ElasticKnowledgeSearcher,
  FirestoreKnowledgeSearcher,
  createKnowledgeSearcher,
  type KnowledgeSearcher,
  type KnowledgeHit,
  type KnowledgeSearchOpts,
  type MockKnowledgeDoc,
  type KnowledgeBackend,
  type KnowledgeFactoryConfig,
  type EmbedQueryFn,
  type VectorNearestFn,
} from './knowledge';

// A2A クライアント (ADK ピアを A2A 越しに招集 / Refinement-ADK 経路 / 2026-06-25)
export { a2aInvoke, extractA2AText, type A2AInvokeResult, type A2AInvokeOpts } from './a2a-client';

// Orchestrator 協議ツールの引数検証 (純粋関数) を re-export (apps/api / 直接 unit テスト用)。
export {
  validateInvocation,
  CEREMONY_AGENTS,
  type AgentInvokeInput,
  type InvocationRejectReason,
  type ValidateInvocationResult,
} from './agent-invoke';

/** buildTools に注入する追加依存 (storage 非依存の検索層など)。 */
export interface BuildToolsDeps {
  /** RAG 検索層。未注入なら knowledge.search ツールを出さない (mock LLM / CLI デモを温存)。 */
  knowledge?: KnowledgeSearcher;
}

/**
 * Tool ファクトリ。RepoContainer + workspaceId を closure cap し、各 Tool の
 * repo.*.list 呼び出しに workspaceId を自動注入する (Phase 1-B IDOR fix / 2026-06-10)。
 *
 * Tool 自体は workspaceId を引数として受け取らない (LLM が任意の値を入れて越境するのを防ぐ)。
 * 呼出側 (api / cli / mcp-server) で「認証済みの workspaceId」を渡す責務を持つ。
 *
 * deps.knowledge を渡すと knowledge.search (RAG 検索) ツールが追加される。
 */
export function buildTools(repo: RepoContainer, workspaceId: string, deps: BuildToolsDeps = {}): AgentTool[] {
  const ticketListTool: AgentTool<{ sprintId?: string; status?: string; assigneeId?: string }, unknown> = {
    spec: {
      name: 'ticket.list',
      description:
        'チケット一覧を取得する。sprintId / status / assigneeId で絞り込み可 (sprintId 未指定は全スプリント + backlog 横断)。各行に type / sprintId / parentTicketId / epicId を含むので、スプリント所属や親子・Epic 紐付けの判定はこの値を使う (未設定のフィールドはキーごと省略される)。',
      parameters: {
        type: 'object',
        properties: {
          sprintId: { type: 'string' },
          status: { type: 'string', enum: ['backlog', 'todo', 'in-progress', 'review', 'done'] },
          assigneeId: { type: 'string' },
        },
      },
    },
    async invoke(args) {
      const ts = await repo.tickets.list({
        workspaceId,
        ...(args.sprintId && { sprintId: args.sprintId }),
        ...(args.status && { status: args.status as Parameters<typeof repo.tickets.list>[0] extends infer U ? U extends { status?: infer S } ? S : never : never }),
        ...(args.assigneeId && { assigneeId: args.assigneeId }),
      });
      // 根本 A (2026-07-08): type / sprintId / parentTicketId / epicId を必ず返す。
      // これらが無いと LLM はスプリント所属・親子紐付けを判別できず、旧スプリントの
      // チケットで台本を作る / 「紐付けなし」と誤認する (ドッグフード F-33/F-11/F-24/F-34)。
      return ts.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        ritual: t.ritual,
        assigneeId: t.assigneeId,
        estimatePt: t.estimatePt,
        ...(t.type !== undefined && { type: t.type }),
        ...(t.sprintId !== undefined && { sprintId: t.sprintId }),
        ...(t.parentTicketId !== undefined && { parentTicketId: t.parentTicketId }),
        ...(t.epicId !== undefined && { epicId: t.epicId }),
      }));
    },
  };

  const ticketGetTool: AgentTool<{ id: string }, unknown> = {
    spec: {
      name: 'ticket.get',
      description:
        'チケット 1 件を id 指定で取得する (存在確認・詳細参照の正)。ticket.list の絞り込みで見つからなくても、id が分かっているならこのツールで実在を確認してから回答すること。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    async invoke({ id }) {
      const t = await repo.tickets.get(id);
      // IDOR ガード: sprint.get と同型。id 推測で他 workspace のチケットを読ませない。
      if (!t || t.workspaceId !== workspaceId) return { error: `ticket not found: ${id}` };
      return t;
    },
  };

  const sprintGetTool: AgentTool<{ id: string }, unknown> = {
    spec: {
      name: 'sprint.get',
      description: 'スプリント情報を取得する。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    async invoke({ id }) {
      const s = await repo.sprints.get(id);
      // IDOR ガード: repo.sprints.get は workspace スコープされないので、id 推測で他 workspace の
      // Sprint を読めないよう tool 側で照合する (薄い CRUD の IDOR 方針と整合 / ticketQualityCheckTool と同型)。
      if (!s || s.workspaceId !== workspaceId) return { error: `sprint not found: ${id}` };
      return s;
    },
  };

  const sprintCurrentTool: AgentTool<Record<string, never>, unknown> = {
    spec: {
      name: 'sprint.current',
      description:
        '現在のスプリント文脈を取得する (id 不要)。active スプリント / 次の planned / velocity 実績 (直近完了の平均) / 直近完了スプリントを返す。ユーザーが sprintId を指定しない時の起点に使う。',
      parameters: { type: 'object', properties: {} },
    },
    async invoke() {
      const sprints = await repo.sprints.list({ workspaceId });
      return summarizeSprintContext(sprints);
    },
  };

  const projectListTool: AgentTool<Record<string, never>, unknown> = {
    spec: {
      name: 'project.list',
      description: 'Workspace 配下の Project 一覧を取得する (Jira プロジェクト相当)。',
      parameters: { type: 'object', properties: {} },
    },
    async invoke() {
      const xs = await repo.projects.list({ workspaceId });
      return xs.map((p) => ({ id: p.id, name: p.name, idPrefix: p.idPrefix, ownerId: p.ownerId }));
    },
  };

  const epicListTool: AgentTool<{ projectId?: string }, unknown> = {
    spec: {
      name: 'epic.list',
      description:
        'Epic 一覧を取得する (戦略単位、複数のUser Storyを束ねる)。projectId で絞り込み可。' +
        'rationale (戦略意図/Why) / successMetric (達成指標) / strategicTheme (上位戦略テーマ) も含む ' +
        '(2026-07-10: 配下チケットが Product Goal → Epic → Story の連鎖に直結しているか判定する材料)。',
      parameters: {
        type: 'object',
        properties: { projectId: { type: 'string' } },
      },
    },
    async invoke(args) {
      const xs = await repo.epics.list({
        workspaceId,
        ...(args.projectId !== undefined && { projectId: args.projectId }),
      });
      return xs.map((e) => ({
        id: e.id,
        name: e.name,
        status: e.status,
        ownerId: e.ownerId,
        valueImpact: e.valueImpact,
        ...(e.rationale !== undefined && { rationale: e.rationale }),
        ...(e.successMetric !== undefined && { successMetric: e.successMetric }),
        ...(e.strategicTheme !== undefined && { strategicTheme: e.strategicTheme }),
      }));
    },
  };

  /**
   * チケット品質診断: Definition of Done / User Story 紐付け / Story Point の充足を確認。
   * Agent はこれを呼んで「DoDが空」「US紐付けなし」「SP未定」を検出し提案する。
   */
  const ticketQualityCheckTool: AgentTool<{ ticketId: string }, unknown> = {
    spec: {
      name: 'ticket.quality.check',
      description:
        'チケット品質診断。DoD (acceptanceCriteria) / User Story 紐付け / Story Point (estimatePt) の不足を検出する。',
      parameters: {
        type: 'object',
        properties: { ticketId: { type: 'string' } },
        required: ['ticketId'],
      },
    },
    async invoke({ ticketId }) {
      const t = await repo.tickets.get(ticketId);
      if (!t) return { error: `ticket not found: ${ticketId}` };
      // IDOR ガード: 他 workspace の ticket を get した時は「存在しない」と同じレスポンスを返す。
      if (t.workspaceId !== workspaceId) return { error: `ticket not found: ${ticketId}` };
      // 診断ロジックは純粋関数 checkTicketQuality に集約 (API endpoint と単一ソース)。
      return checkTicketQuality(t);
    },
  };

  /**
   * バックログリファインメント診断: Refinement Agent が呼ぶ専用 Tool。
   *
   * 5観点で「形骸化兆候」を検出する:
   * (1) Story 粒度過大 (estimatePt > 8)
   * (2) 依存関係未整理 (blockedBy が空、または parentTicketId が US- でない)
   * (3) valueImpact 未設定
   * (4) priority × valueImpact ミスマッチ (priority=urgent ∧ valueImpact=low / priority=low ∧ valueImpact=high)
   * (5) 同 sprintId 配下の estimatePt のバラつき異常 (stddev / mean > 0.6)
   */
  const backlogRefinementCheckTool: AgentTool<
    { sprintId?: string; projectId?: string },
    unknown
  > = {
    spec: {
      name: 'backlog.refinement.check',
      description:
        'バックログ候補チケット群をリファインメント 6 観点で診断する。粒度過大 / 依存関係未整理 / valueImpact 未設定 / priority↔valueImpact ミスマッチ / SP 見積バラつき異常 / Epic.rationale 欠落 (戦略意図ドリフト) を検出。',
      parameters: {
        type: 'object',
        properties: {
          sprintId: { type: 'string' },
          projectId: { type: 'string' },
        },
      },
    },
    async invoke({ sprintId, projectId }) {
      // 6 観点 + 種別ルールの診断ロジックは純粋関数 checkBacklogRefinement に集約
      // (API endpoint GET /api/refinement と単一ソース)。
      const [tickets, epics, sprints, estimations] = await Promise.all([
        repo.tickets.list({ workspaceId }),
        repo.epics.list({ workspaceId }),
        repo.sprints.list({ workspaceId }),
        repo.estimations.list({ workspaceId }),
      ]);
      return checkBacklogRefinement(
        { tickets, epics, sprints, estimations, now: new Date().toISOString() },
        {
          ...(sprintId !== undefined && { sprintId }),
          ...(projectId !== undefined && { projectId }),
        },
      );
    },
  };

  /**
   * レトロの carry-forward 積み上げ一覧。チームが合意したプロセス改善ルール。
   * 全 Agent が起動時に呼び、自分の儀式に関係する Try を検出ルールとして動的に適用する。
   * Try は Sprint バックログに積むものではなく「検出基準」として機能する。
   * 例: 「AC に期日を入れる」→ Refinement が期日なし AC を指摘
   *     「BLOCKED 時は理由必須」→ Daily が理由なし BLOCKED を検出
   *     「Goal を SMART にする」→ Planner が Goal 評価を強化
   * done=true の Try はルールとして除外する (チームが定着と判断した改善)。
   */
  const retroTriesListTool: AgentTool<Record<string, never>, unknown> = {
    spec: {
      name: 'retro.tries.list',
      description:
        'チームが合意したプロセス改善ルール (carry-forward 積み上げ) の一覧。全 Agent が起動時に呼び、done=false の Try を自分の儀式の検出基準として動的に適用する。Try は Sprint バックログに積む対象ではない。',
      parameters: { type: 'object', properties: {} },
    },
    async invoke() {
      const xs = await repo.retroTries.list({ workspaceId });
      return xs.map((t) => ({
        id: t.id,
        text: t.text,
        sprintNumber: t.sprintNumber,
        done: t.done,
      }));
    },
  };

  const memberListTool: AgentTool<Record<string, never>, unknown> = {
    spec: {
      name: 'member.list',
      description: 'チームメンバ一覧を取得する。',
      parameters: { type: 'object', properties: {} },
    },
    async invoke() {
      const ms = await repo.members.list({ workspaceId });
      return ms.map((m) => ({ userId: m.userId, displayName: m.displayName, role: m.role }));
    },
  };

  const humanAskTool: AgentTool<{ question: string }, unknown> = {
    spec: {
      name: 'human.ask',
      description: '不確実な判断を HITL で人間に投げる。',
      parameters: {
        type: 'object',
        properties: { question: { type: 'string' } },
        required: ['question'],
      },
    },
    async invoke({ question }) {
      console.log(`\n[human.ask] ${question}\n[mock] yes と回答したことにする\n`);
      return { answer: 'yes' };
    },
  };

  // 種別ルールエンジン汎用ツール (T4)。儀式を指定すると該当ルールの findings を返す。
  // Refinement/Planner/Daily の各 Agent が呼べる。UI バッジ / AI Integrity Panel も同じ結果を使う。
  const ticketRulesCheckTool: AgentTool<{ ceremony: string }, unknown> = {
    spec: {
      name: 'ticket.rules.check',
      description:
        'チケット種別ルールを儀式単位で実行し findings を返す。ceremony=refinement/planning/daily/review/retrospective。種別 (story/task/spike/bug/incident) 別の品質・停滞・過剰計画 (velocity 超過)・見積もり割れを検出。',
      parameters: {
        type: 'object',
        properties: {
          ceremony: { type: 'string', enum: ['planning', 'daily', 'refinement', 'review', 'retrospective'] },
        },
        required: ['ceremony'],
      },
    },
    async invoke({ ceremony }) {
      const [allTickets, sprints, estimations, epics] = await Promise.all([
        repo.tickets.list({ workspaceId }),
        repo.sprints.list({ workspaceId }),
        repo.estimations.list({ workspaceId }),
        repo.epics.list({ workspaceId }),
      ]);
      const ruleCtx = buildRuleContext(new Date().toISOString(), allTickets, sprints, estimations, epics);
      const findings = runTicketRules(ceremony as Ritual, ruleCtx);
      return { ceremony, findingCount: findings.length, findings };
    },
  };

  const tools: AgentTool[] = [
    ticketListTool,
    ticketGetTool,
    sprintGetTool,
    sprintCurrentTool,
    projectListTool,
    epicListTool,
    ticketQualityCheckTool,
    backlogRefinementCheckTool,
    ticketRulesCheckTool,
    retroTriesListTool,
    memberListTool,
    humanAskTool,
  ];

  // RAG 検索層が注入されている時のみ knowledge.search を出す (未注入なら従来通り = mock LLM / CLI 温存)。
  if (deps.knowledge) {
    const knowledge = deps.knowledge;
    const knowledgeSearchTool: AgentTool<{ query: string; topK?: number }, unknown> = {
      spec: {
        name: 'knowledge.search',
        description:
          'Scrum 知識ベース (公式 Scrum Guide / DoD / Story Point 等) と過去ふりかえり Try を意味検索する。指摘や提案の根拠を示すため、結果の source ID (例 definition-of-done.md#完了の定義) を引用するのに使う。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            topK: { type: 'number' },
          },
          required: ['query'],
        },
      },
      async invoke({ query, topK }) {
        const hits = await knowledge.search(query, {
          workspaceId,
          ...(topK !== undefined && { topK }),
        });
        return { count: hits.length, hits };
      },
    };
    tools.push(knowledgeSearchTool);
  }

  return tools;
}

/** buildOrchestratorTools に注入する依存。 */
export interface OrchestratorToolsDeps extends BuildToolsDeps {
  /** 子 runAgent を起動する LLM。Orchestrator 自身と同じプロバイダを渡す。 */
  llm: LLMProvider;
  /**
   * 1 リクエスト内で許容する子 run コストの累積上限 (USD)。超過後の agent.invoke は
   * error tool_result を返す (子 run は起動しない)。Mock LLM は costUsd=0 (mock.ts) なので
   * CI/デモでは発火しない = 無害。未指定なら無制限。
   */
  costCapUsd?: number;
  /**
   * 起動した子 run を集約するコレクタ。呼出側 (apps/api ハンドラ) が配列を渡し、
   * runAgent 完了後に親 run.childRuns へマージする。深さ 1 固定の証拠でもある
   * (子 run は agent.invoke を持たないので孫 run はここに積まれない)。
   */
  childRuns: AgentRun[];
  /**
   * 親 Orchestrator が受け取った画面文脈 (active sprint / 表示中チケット等)。指定時は
   * agent.invoke で起動する子 runAgent にもそのまま伝播する (根本 B / 2026-07-08)。
   * これが無いと単一窓口 ON 時に「今のスプリント」を知らない子が全件走査し、旧スプリントの
   * チケットで回答を組み立てる (ドッグフード F-33/F-34)。
   */
  contextText?: string;
}

/**
 * Orchestrator 専用の Tool セットを組み立てる。
 *
 * buildTools の戻り (= 子に渡すのと同一の素のツール集合) に agent.invoke を 1 個だけ足す。
 * agent.invoke は呼び出された ceremony agent を **in-process で子 runAgent として再帰起動**する
 * (HTTP 往復なし)。子には agent.invoke を含まない buildTools を渡すため、深さ 1 が構造的に保証される
 * (孫協議は物理的に発生しない)。
 *
 * buildTools のシグネチャは不変なので、他 5 agent は従来どおり buildTools を使う。
 * Orchestrator 起動時のみ呼出側がこのファクトリに切り替えることで「Orchestrator にのみ agent.invoke」を満たす。
 */
// 子 runAgent の反復上限。runtime のデフォルト (6) に暗黙依存せず明示的に渡し、デフォルトを変えても
// 協議の反復上限が静かにドリフトしないようにする (深さ1 と並ぶ無限協議対策の明示化)。
export const CHILD_MAX_ITERATIONS = 6;

export function buildOrchestratorTools(
  repo: RepoContainer,
  workspaceId: string,
  deps: OrchestratorToolsDeps,
): AgentTool[] {
  const baseDeps: BuildToolsDeps = deps.knowledge ? { knowledge: deps.knowledge } : {};
  // 親 Orchestrator が持つツール = 素の buildTools + agent.invoke。
  const tools = buildTools(repo, workspaceId, baseDeps);

  // 子に渡すツールは agent.invoke を含まない素の buildTools (= 深さ 1 固定の核)。
  const childTools = buildTools(repo, workspaceId, baseDeps);

  const agentInvokeTool: AgentTool<{ agentName?: unknown; prompt?: unknown }, unknown> = {
    spec: {
      name: 'agent.invoke',
      description:
        'スクラムマスター (Orchestrator) が 5 儀式 agent (planner/daily/refinement/reviewer/retrospective) の 1 体を子として起動し、その出力を受け取って協議を統括する。協議は深さ 1 (呼ばれた agent はさらに agent.invoke できない)。バックログ/スプリントの点検・診断・品質確認・計画・リスク評価・レビュー・振り返りを求められたら (「協議して」の明示や「必要なら」と委ねられた場合も含め)、一般論で答えず該当 agent をこの tool で招集すること。',
      parameters: {
        type: 'object',
        properties: {
          agentName: { type: 'string', enum: [...CEREMONY_AGENTS] },
          prompt: { type: 'string' },
        },
        required: ['agentName', 'prompt'],
      },
    },
    async invoke(args) {
      // 引数検証 (空名 / 未知名 / 自己参照 / 空 prompt)。reject は throw せず error tool_result を返す
      // (runtime.ts の tool catch と同じ無害な形 = 親 run は failed にならず協議を続けられる)。
      const v = validateInvocation(args, { selfName: 'orchestrator', knownAgents: CEREMONY_AGENTS });
      if (!v.ok) {
        return { error: v.reason };
      }

      // 1 リクエスト costUsd ハードキャップ: 既に積んだ子 run の合計が cap 以上なら起動しない。
      if (deps.costCapUsd !== undefined) {
        const spent = deps.childRuns.reduce((sum, r) => sum + r.llmUsage.costUsd, 0);
        if (spent >= deps.costCapUsd) {
          return { error: 'cost_cap_exceeded' };
        }
      }

      // 子 runAgent を in-process 起動。workspaceId は親 closure を継承 (IDOR: 他 ws 越境不可)。
      // 子ツールは agent.invoke を含まない childTools = 深さ 1。
      const childRun = await runAgent(
        {
          agentName: v.agentName,
          workspaceId,
          llm: deps.llm,
          model: modelForAgent(v.agentName),
          systemPrompt: buildSystemPrompt(v.agentName),
          tools: buildRegistry(childTools),
          trigger: 'event',
          maxIterations: CHILD_MAX_ITERATIONS,
          // 親の画面文脈を子へ伝播 (根本 B)。子も「今どのスプリントか」を知った上でツールを絞れる。
          ...(deps.contextText && { contextText: deps.contextText }),
        },
        v.prompt,
      );

      // 親 run へマージするコレクタに積む。
      deps.childRuns.push(childRun);

      return {
        agentName: childRun.agentName,
        status: childRun.status,
        summary: childRun.outputArtifacts?.summary,
      };
    },
  };

  tools.push(agentInvokeTool);
  return tools;
}
