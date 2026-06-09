import type { AgentTool } from '@belvedere/agent';
import type { RepoContainer } from '@belvedere/repo';

/**
 * Tool ファクトリ。RepoContainer + workspaceId を closure cap し、各 Tool の
 * repo.*.list 呼び出しに workspaceId を自動注入する (Phase 1-B IDOR fix / 2026-06-10)。
 *
 * Tool 自体は workspaceId を引数として受け取らない (LLM が任意の値を入れて越境するのを防ぐ)。
 * 呼出側 (api / cli / mcp-server) で「認証済みの workspaceId」を渡す責務を持つ。
 */
export function buildTools(repo: RepoContainer, workspaceId: string): AgentTool[] {
  const ticketListTool: AgentTool<{ sprintId?: string; status?: string; assigneeId?: string }, unknown> = {
    spec: {
      name: 'ticket.list',
      description: 'チケット一覧を取得する。sprintId / status / assigneeId で絞り込み可。',
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
      return ts.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        ritual: t.ritual,
        assigneeId: t.assigneeId,
        estimatePt: t.estimatePt,
      }));
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
      return s ?? { error: `sprint not found: ${id}` };
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
      description: 'Epic 一覧を取得する (戦略単位、複数のUser Storyを束ねる)。projectId で絞り込み可。',
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
      const issues: string[] = [];
      if (!t.acceptanceCriteria || t.acceptanceCriteria.length === 0) issues.push('DoD (acceptanceCriteria) が空');
      if (t.estimatePt === undefined) issues.push('Story Point (estimatePt) 未定');
      // User Story 紐付けは parentTicketId が US-* で始まるかで判定 (将来は専用フィールド)
      const hasStoryLink = (t.parentTicketId ?? '').startsWith('US-');
      if (!hasStoryLink) issues.push('User Story 紐付けなし');
      const qualityRate = (4 - issues.length - (t.title ? 0 : 1)) / 4;
      return {
        ticketId,
        title: t.title,
        issues,
        qualityRate: Math.max(0, qualityRate),
        ok: issues.length === 0,
      };
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
      const tickets = await repo.tickets.list({
        workspaceId,
        ...(sprintId !== undefined && { sprintId }),
        ...(projectId !== undefined && { projectId }),
      });
      const findings: Array<{ ticketId: string; signal: string; detail: string }> = [];

      for (const t of tickets) {
        if ((t.estimatePt ?? 0) > 8) {
          findings.push({
            ticketId: t.id,
            signal: 'oversize_story',
            detail: `Story Point ${t.estimatePt} (>8)。1スプリントに収まらない可能性、分割推奨。`,
          });
        }
        const hasBlockedBy = (t.blockedBy?.length ?? 0) > 0;
        const hasStoryLink = (t.parentTicketId ?? '').startsWith('US-');
        if (!hasBlockedBy && !hasStoryLink) {
          findings.push({
            ticketId: t.id,
            signal: 'unstructured_dependency',
            detail: 'blockedBy / parentTicketId (US-紐付け) のいずれも未設定。依存関係を整理してください。',
          });
        }
        if (t.valueImpact === undefined) {
          findings.push({
            ticketId: t.id,
            signal: 'value_impact_missing',
            detail: 'valueImpact (プロダクトゴール貢献度) が未設定。PO に確認推奨。',
          });
        }
        if (t.priority === 'urgent' && t.valueImpact === 'low') {
          findings.push({
            ticketId: t.id,
            signal: 'priority_value_mismatch',
            detail: 'priority=urgent だが valueImpact=low。緊急度の根拠を確認。',
          });
        }
        if (t.priority === 'low' && t.valueImpact === 'high') {
          findings.push({
            ticketId: t.id,
            signal: 'priority_value_mismatch',
            detail: 'priority=low だが valueImpact=high。プロダクトゴール直結なので priority 引き上げ推奨。',
          });
        }
        if (t.priority === 'medium' && t.valueImpact === 'high') {
          findings.push({
            ticketId: t.id,
            signal: 'priority_value_mismatch_soft',
            detail: 'priority=medium だが valueImpact=high。プロダクトゴール貢献度の高さに比して優先度が低い可能性。',
          });
        }
      }

      // SP 分散異常 (sprintId 単位)
      if (tickets.length >= 3) {
        const pts = tickets.map((t) => t.estimatePt ?? 0).filter((p) => p > 0);
        if (pts.length >= 3) {
          const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
          const variance = pts.reduce((a, b) => a + (b - mean) ** 2, 0) / pts.length;
          const stddev = Math.sqrt(variance);
          const cv = mean > 0 ? stddev / mean : 0;
          if (cv > 0.6) {
            findings.push({
              ticketId: '*',
              signal: 'sp_variance_high',
              detail: `Story Point の分散が大きい (CV=${cv.toFixed(2)})。粒度差を再見積推奨。`,
            });
          }
        }
      }

      // 第6観点: 戦略整合性 — Epic.rationale (戦略意図 / Why) が空のものを警告
      const epics = await repo.epics.list({
        workspaceId,
        ...(projectId !== undefined && { projectId }),
      });
      for (const e of epics) {
        if (!e.rationale || e.rationale.trim().length === 0) {
          findings.push({
            ticketId: e.id,
            signal: 'strategic_intent_missing',
            detail: `Epic ${e.id} (${e.name}) に rationale (戦略意図 / Why) が未設定。配下のチケットが「何のために?」を見失う形骸化サイン。`,
          });
        }
      }

      return {
        scanned: tickets.length,
        scannedEpics: epics.length,
        findingCount: findings.length,
        findings,
      };
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

  const slackPostTool: AgentTool<{ channel: string; text: string }, unknown> = {
    spec: {
      name: 'slack.message.post',
      description: 'Slackにメッセージを投稿する (現在はローカルで stdout に出力)。',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['channel', 'text'],
      },
    },
    async invoke({ channel, text }) {
      console.log(`\n┌─ Slack post → #${channel}\n│ ${text.replace(/\n/g, '\n│ ')}\n└─\n`);
      return { ok: true, ts: new Date().toISOString() };
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

  // Sprint Review 録画 → 指摘抽出 → Ticket 候補 (Phase 2 で Gemini Multimodal 接続予定、現状はモック)
  const videoExtractIssuesTool: AgentTool<{ recordingId: string }, unknown> = {
    spec: {
      name: 'video.extractIssues',
      description:
        'Sprint Review 録画動画 (ReviewRecording) を Multimodal LLM で読み取り、ステークホルダの指摘を抽出して Ticket 起票候補に変換する。各候補に sourceRecordingId / sourceTimestampSec / sourceQuote / sourceSpeakerId を紐付ける。',
      parameters: {
        type: 'object',
        properties: {
          recordingId: { type: 'string', description: 'ReviewRecording.id' },
        },
        required: ['recordingId'],
      },
    },
    async invoke({ recordingId }) {
      // Phase 2 で Gemini 2.5 Pro Multimodal に接続予定。現状はモック応答。
      return {
        recordingId,
        extractedCount: 3,
        candidates: [
          {
            sourceTimestampSec: 755,
            sourceQuote: 'この緑のボタン、目立たないから色を変えてほしい',
            sourceSpeakerId: 'tanaka',
            suggestedTitle: 'レビュー指摘: 主要 CTA ボタンの視認性改善',
            suggestedDoD: [
              'ボタンの色を Hoshino 暖オレンジ系に統一',
              'WCAG AA コントラスト 4.5:1 以上確保',
              'a11y チェックリスト通過',
            ],
            suggestedSP: 2,
            suggestedValueImpact: 'medium',
          },
          {
            sourceTimestampSec: 1122,
            sourceQuote: '一覧の並び順、自分でカスタマイズできるようにしてほしい',
            sourceSpeakerId: 'tanaka',
            suggestedTitle: 'レビュー指摘: チケット一覧の並び順カスタマイズ',
            suggestedDoD: ['priority / valueImpact / updatedAt の3軸でソート可能', 'ユーザー設定を localStorage に永続化'],
            suggestedSP: 5,
            suggestedValueImpact: 'medium',
          },
          {
            sourceTimestampSec: 1480,
            sourceQuote: 'AI が提案した DoD、出典も一緒に見せてくれる?',
            sourceSpeakerId: 'okubo',
            suggestedTitle: 'レビュー指摘: AI 提案に出典 (US/Epic/過去類似) を併記',
            suggestedDoD: [
              'AIPanel に source citation 行を追加',
              '出典をクリックで該当 Epic/Story にジャンプ',
            ],
            suggestedSP: 3,
            suggestedValueImpact: 'high',
          },
        ],
      };
    },
  };

  return [
    ticketListTool,
    sprintGetTool,
    projectListTool,
    epicListTool,
    ticketQualityCheckTool,
    backlogRefinementCheckTool,
    memberListTool,
    slackPostTool,
    humanAskTool,
    videoExtractIssuesTool,
  ];
}
