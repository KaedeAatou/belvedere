// RAG 検索層の抽象 (KnowledgeSearcher) — 2026-06-18。
//
// 役割分離 (非交渉): Firestore=データ正本 (tickets/sprints) / Elastic=RAG 検索層
// (Scrum 知識 KB・過去 Try の検索用派生コピーのみ)。よって RepoContainer には入れず、
// llm と同じ依存注入 (createApp({ repo, llm, knowledge })) で別レイヤとして渡す。
//
// 埋め込み方式の選択 (ELSER 既定 / Gemini Embeddings 将来 dense 切替) は
// ElasticKnowledgeSearcher の内部クエリに閉じ、この interface とエージェント側
// knowledge.search ツールの I/F は不変に保つ (LLMProvider 抽象と同じ思想)。
//
// 未接続時は silent fallback せず throw (LLM_PROVIDER=vertex / REPO_BACKEND=firestore と同じ
// signpost)。env 未設定なら呼出側で searcher=undefined にし、buildTools が knowledge.search
// ツールを出さない (mock LLM デモ / CLI を壊さない)。

/**
 * 検索ヒット 1 件。`sourceId` は引用要件のための出典 ID
 * (例 `definition-of-done.md#完了の定義`)。Agent は回答根拠として必ずこれを引用する。
 */
export interface KnowledgeHit {
  sourceId: string;
  title: string;
  text: string;
  score: number;
}

export interface KnowledgeSearchOpts {
  /** 認証済み workspaceId。テナント別 index の選択は呼出側が closure cap し LLM に選ばせない。 */
  workspaceId: string;
  /** 取得件数 (既定 3)。 */
  topK?: number;
}

/** RAG コンテキスト検索層の抽象。実装は mock (テスト/デモ) / elastic (本番)。 */
export interface KnowledgeSearcher {
  readonly name: string;
  search(query: string, opts: KnowledgeSearchOpts): Promise<KnowledgeHit[]>;
}

// ===== Mock (キーワード一致 / 決定的) =====

export interface MockKnowledgeDoc {
  sourceId: string;
  title: string;
  text: string;
}

/**
 * Elastic 不要の決定的スタブ。テストと CLI / mock LLM デモ用。
 * query の語が title/text に何件含まれるかでスコアリングする単純な keyword 一致。
 */
export class MockKnowledgeSearcher implements KnowledgeSearcher {
  readonly name = 'mock';
  private readonly docs: MockKnowledgeDoc[];

  constructor(docs: MockKnowledgeDoc[] = []) {
    this.docs = docs;
  }

  async search(query: string, opts: KnowledgeSearchOpts): Promise<KnowledgeHit[]> {
    const topK = opts.topK ?? 3;
    await Promise.resolve();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.docs
      .map((d) => {
        const hay = `${d.title}\n${d.text}`.toLowerCase();
        const score = terms.reduce((n, t) => (hay.includes(t) ? n + 1 : n), 0);
        return { sourceId: d.sourceId, title: d.title, text: d.text, score };
      })
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

// ===== Elastic Cloud (semantic_text / ELSER を REST 直叩き) =====

export interface ElasticConfig {
  /** Elastic Cloud エンドポイント URL (末尾スラッシュ不要)。 */
  url: string;
  /** Elastic API キー。`Authorization: ApiKey <key>` に載せ、URL には載せない (ログ漏洩回避)。 */
  apiKey: string;
  /** 全社共通 KB index (既定 `belvedere-kb-scrum`)。 */
  kbIndex?: string;
  /** テナント別 Try index の prefix (既定 `belvedere-kb-tries-`)。workspaceId を付けて使う。 */
  triesIndexPrefix?: string;
  /** semantic_text フィールド名 (既定 `content`)。ELSER inference は index 側で適用。 */
  field?: string;
  /** テスト用に fetch を差し替える。未指定なら global fetch。 */
  fetchImpl?: typeof fetch;
}

interface ElasticHit {
  _id?: string;
  _score?: number;
  _source?: Record<string, unknown>;
}
interface ElasticSearchResponse {
  hits?: { hits?: ElasticHit[] };
}

/**
 * Elastic Cloud の `_search` を semantic query (semantic_text + ELSER) で叩く。
 * 既定は ELSER (Elastic 内蔵 inference / 埋め込みパイプライン不要)。将来 Gemini Embeddings
 * (dense_vector) に切替える場合はこの `search` 内部の query だけ差し替える (I/F は不変)。
 */
export class ElasticKnowledgeSearcher implements KnowledgeSearcher {
  readonly name = 'elastic';
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly kbIndex: string;
  private readonly triesIndexPrefix: string;
  private readonly field: string;
  private readonly fetchImpl: typeof fetch;

  constructor(cfg: ElasticConfig) {
    if (!cfg.url || !cfg.apiKey) {
      throw new Error(
        '[knowledge:elastic] ELASTIC_URL / ELASTIC_API_KEY が未設定です。Elastic Cloud に接続するには両方を設定してください (SEARCH_BACKEND=elastic)。',
      );
    }
    this.baseUrl = cfg.url.replace(/\/+$/, '');
    this.apiKey = cfg.apiKey;
    this.kbIndex = cfg.kbIndex ?? 'belvedere-kb-scrum';
    this.triesIndexPrefix = cfg.triesIndexPrefix ?? 'belvedere-kb-tries-';
    this.field = cfg.field ?? 'content';
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  async search(query: string, opts: KnowledgeSearchOpts): Promise<KnowledgeHit[]> {
    const topK = opts.topK ?? 3;
    // index は「全社 KB + そのテナントの Try」に固定し workspaceId を closure 側で付ける
    // (LLM に index を選ばせない = ticket.list の workspaceId 自動注入と同じ越境防止思想)。
    const indices = `${this.kbIndex},${this.triesIndexPrefix}${opts.workspaceId}`;
    // 片方の index が未作成でも 404 にしない (ignore_unavailable)。
    const url = `${this.baseUrl}/${encodeURIComponent(indices)}/_search?ignore_unavailable=true`;
    const body = {
      size: topK,
      query: { semantic: { field: this.field, query } },
      _source: ['sourceId', 'title', this.field],
    };

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `ApiKey ${this.apiKey}` },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`[knowledge:elastic] ${res.status} ${res.statusText}: ${errText.slice(0, 300)}`);
    }

    const data = (await res.json()) as ElasticSearchResponse;
    return (data.hits?.hits ?? []).map((h) => {
      const src = h._source ?? {};
      return {
        sourceId: typeof src.sourceId === 'string' ? src.sourceId : (h._id ?? ''),
        title: typeof src.title === 'string' ? src.title : '',
        text: typeof src[this.field] === 'string' ? (src[this.field] as string) : '',
        score: h._score ?? 0,
      };
    });
  }
}

// ===== factory (env switch は呼出側 apps/api が process.env を渡す) =====

export type KnowledgeBackend = 'none' | 'elastic' | 'mock';

export interface KnowledgeFactoryConfig {
  url?: string;
  apiKey?: string;
  mockDocs?: MockKnowledgeDoc[];
}

/**
 * backend で KnowledgeSearcher を切り替える (LLM_PROVIDER / REPO_BACKEND と同じ思想)。
 * - `none` (既定): undefined を返す → buildTools が knowledge.search ツールを出さない
 * - `elastic`: ElasticKnowledgeSearcher (URL/APIキー未設定なら constructor が throw)
 * - `mock`: MockKnowledgeSearcher (キーワード一致)
 * env (`SEARCH_BACKEND` / `ELASTIC_URL` / `ELASTIC_API_KEY`) の読取は呼出側で行い、値を渡す。
 */
export function createKnowledgeSearcher(
  backend: KnowledgeBackend | string | undefined,
  cfg: KnowledgeFactoryConfig = {},
): KnowledgeSearcher | undefined {
  switch (backend) {
    case 'elastic':
      return new ElasticKnowledgeSearcher({ url: cfg.url ?? '', apiKey: cfg.apiKey ?? '' });
    case 'mock':
      return new MockKnowledgeSearcher(cfg.mockDocs ?? []);
    case 'none':
    case undefined:
    case '':
      return undefined;
    default:
      throw new Error(`[knowledge] unknown backend: ${backend} (none / elastic / mock)`);
  }
}
