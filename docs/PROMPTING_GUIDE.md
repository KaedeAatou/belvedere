# Belvedere — Prompting Guide

> 出典: Anthropic「Prompting 101 | Code w/ Claude」 (2025-05-22, Hannah Moran / Christian Ryan) + 公式 Prompt Engineering Best Practices
> Belvedere プロジェクトの全エージェントプロンプト (TS / Python) はこのガイドの規約に従って書く。

---

## 0. 大原則

プロンプトエンジニアリングは **コードを書く** より **有能だが文脈を知らない同僚に依頼文を渡す** 感覚に近い。

- **コードと同様に評価可能な成果物**として扱う
- 反復改善前提 — 一発でベストは出ない
- **eval set で計測 → プロンプトを直す** のループ
- レイテンシやコストはモデル選択で解決すべき場合がある (プロンプトでは無理)

---

## 1. 10点構造フレームワーク (Prompting 101 の中心)

system prompt は次の10要素で構成する。**全部入れる必要はない**が、抜けたときに「なぜ抜いたか」を答えられること。

```
<role>          1. 役割定義  (例: 「あなたは Belvedere の Planner Agent です」)
<task>          2. タスク    (例: 「Sprint Planning の議題ドラフトを生成する」)
<tone>          3. トーン    (例: 「簡潔・断定的・日本語」)
<context>       4. 背景      (例: ドメイン用語・組織・スプリント情報)
<data>          5. 入力データ (例: チケット一覧 / Epic / 過去Try)
<examples>      6. 例示      (Few-shot, 2〜5件)
<rules>         7. 制約      (してはいけないこと、不確実時の振る舞い)
<reasoning>     8. 思考順序  (step-by-step, 三段論法など)
<output_format> 9. 出力形式  (XML / JSON Schema / プレーン)
<prefill>       10. 事前充填 (assistant 側を一部埋めて続きを書かせる)
```

---

## 2. XMLタグで構造化 (XML structuring)

Anthropic推奨の最強ツール。**LLMはXMLタグで囲まれた領域を意味的にひとかたまりとして扱う**。
プロンプト内では Markdown よりXMLタグを優先する。

### Belvedere での標準タグ
```xml
<role>...</role>
<responsibility>...</responsibility>
<context>
  <project id="PRJ-belvedere-core" idPrefix="BV">...</project>
  <sprint id="sprint-13">...</sprint>
  <epics>...</epics>
  <tickets>...</tickets>
</context>
<rules>
  <rule>...</rule>
</rules>
<examples>
  <example>
    <input>...</input>
    <reasoning>...</reasoning>
    <output>...</output>
  </example>
</examples>
<output_format>
  <schema>...</schema>
</output_format>
```

タグ名は **意味を表す名詞** (project / sprint / epic / ticket / try) を使う。`<thing1>` `<input1>` のような無意味タグは避ける。

---

## 3. ロールプロンプティング

3行のテンプレ:

```
あなたは [役割名] です。
責務: [何を達成するか1〜2行]。
重要: [この役割の最重要原則を1行]。
```

### Belvedere の5儀式エージェント

| Agent | 役割 | 重要原則 |
|---|---|---|
| Planner | Sprint Planning 支援 / Sprint Goal / 容量 / チケット品質 (DoD/SP/US紐付け) 診断 | 議題ドラフトはチケット品質診断を済ませてから作る |
| Refinement | Backlog Refinement 支援 / 粒度 (SP>8) / 依存 / valueImpact / priority×valueImpact / SP分散 | 提案は L2、人間承認後に書込 |
| Daily | Daily Scrum 支援 / Velocity 整合 / 2日完了率 / 3日停滞 (血のつまり) | 3日以上動きのないチケットは警告候補に上げる |
| Reviewer | Sprint Review 支援 / デモシナリオ / Cloud Run preview URL集 | デモは review/done のチケットからのみ構成 |
| Retrospective | Retrospective 支援 / Try 抽出 / 翌スプリントWIPへ転記 / CeremonyHealthScore 推移 | Try は parentTicketId で元の議事と必ず紐付ける |
| Orchestrator | 5儀式の起動順制御 / 軽量モデル | 重い思考はサブエージェントに委譲 |

---

## 4. 背景データの渡し方 (Context engineering)

### 4-1. システムプロンプトにドメイン用語集

「儀式」「ベロシティ」「血のつまり」のように現場特有の用語は、system prompt の冒頭で定義する。スクラム標準語 (Sprint Goal / Definition of Done / Velocity / Story Point / WSJF) は定義不要。

```xml
<glossary>
  <term name="儀式 (ceremony)">Planning / Daily / Refinement / Review / Retrospective の総称</term>
  <term name="血のつまり">3営業日以上動きのないチケット (Daily Agent の検出対象)</term>
  <term name="valueImpact">プロダクトゴール (Workspace.productGoal) への貢献度。priority (緊急度) と独立した high/medium/low 軸</term>
</glossary>
```

### 4-2. データ部はXMLでスキーマ付き

```xml
<context>
  <sprint id="sprint-13" goal="..." capacity="32" velocity="24"/>
  <tickets>
    <ticket id="WC-105" priority="urgent" valueImpact="high">...</ticket>
    ...
  </tickets>
</context>
```

ID付きで渡す → 出力時に「`WC-105` を根拠に...」と引用しやすい。

### 4-3. コンテキストウィンドウは有限

長い transcript や全 PR diff を渡したいときは:
1. 関連箇所だけ抜き出す (Plannerなら現スプリントのチケットだけ)
2. 階層化する (要約 → 詳細はTool経由で取得)
3. **prompt caching** (§9参照)

---

## 5. Few-shot examples

> 「説明するより例を見せる」が常に効く。

### 入れる量
- 2〜5件が目安
- "good" だけでなく "bad → fix" の例も混ぜる
- 例の中に **思考プロセスを書く** (`<reasoning>` タグ)

### Belvedere での例 (Planner用)

```xml
<examples>
  <example>
    <input>
      <ticket id="WC-105" priority="urgent" valueImpact="high" estimatePt="8" status="in-progress">
        チケット品質スコアのヘッダ常設化 (DoD: 3件埋まっている / parentTicketId: US-201)
      </ticket>
      <ticket id="WC-101" priority="high" valueImpact="medium" estimatePt="3" status="todo">
        プランニング会議の議事録テンプレ刷新 (DoD: 空 / parentTicketId: 未設定)
      </ticket>
    </input>
    <reasoning>
      WC-105 は品質要件をすべて満たしているので議題化不要。
      WC-101 は DoD 空 / User Story 紐付けなしなので、議題2「品質要修正リスト」に入れる。
      候補 DoD は acceptanceCriteria を3件提案 (L2 承認後に反映)。
    </reasoning>
    <output>
      <agenda_item ticketIds="WC-101" durationMin="10">
        WC-101 の DoD 候補 と US-201 紐付けを承認 (3min)
      </agenda_item>
    </output>
  </example>
  <!-- 2〜4個追加 -->
</examples>
```

### 例の作り方
- seed (`packages/seed/`) の WC-101..112 / EP-1..4 / US-101..US-402 から拾う (ID整合保証)
- 自分でデモシナリオを動かして得た出力を「正解例」として固定

---

## 6. ステップバイステップ (Chain of thought)

複数の判断を組み合わせる場合、**思考順序を明示** する。

### Belvedere の Planner用 (チケット品質診断 → 議題ドラフト)
```xml
<reasoning>
  以下の順番で考えてください:
  1. sprint.get で現スプリントの容量と Sprint Goal を確認
  2. ticket.list で対象スプリントのチケット一覧を取得
  3. 各チケットに ticket.quality.check を呼び、DoD / Story Point / User Story 紐付けの不足を検出
  4. epic.list で関連 Epic の進捗を確認
  5. 議題ドラフトを生成 (品質要修正リスト + 容量計算 + Epic 進捗)
</reasoning>
```

### Belvedere の Refinement用 (5観点診断)
```xml
<reasoning>
  1. project.list / epic.list で対象 Project/Epic を把握
  2. ticket.list で次スプリント候補チケット群を取得
  3. backlog.refinement.check で5観点を一括診断:
     ① 粒度過大 (SP>8)
     ② 依存関係未整理 (blockedBy / parentTicketId 欠落)
     ③ valueImpact 未設定
     ④ priority × valueImpact ミスマッチ
     ⑤ SP 見積バラつき異常
  4. Workspace.productGoal の文字列と整合を取って優先度ミスマッチを再評価
  5. 提案は L2 (人間承認後に書込)
</reasoning>
```

### Belvedere の Retrospective用
```xml
<reasoning>
  1. 前スプリントの議事から Try を抽出
  2. 各 Try に owner 候補を member.list から提案
  3. 翌スプリントWIPへ転記する parentTicketId を付ける
  4. CeremonyHealthScore を計算し、低下している儀式を指摘
</reasoning>
```

### Extended Thinking (Claude / Gemini Thinking モード)
重い推論は `<thinking>` ブロックを使ってモデル内部で長考させる。
本番では Vertex AI Gemini の Thinking モード (`thinkingConfig`) を有効にする。

---

## 7. 出力形式の制御

### 7-1. JSON Schema 強制 (推奨)

Mock LLM では `responseSchema` パラメータあり、本物 Gemini では `responseMimeType: "application/json"` + `responseSchema` を使う。

```xml
<output_format>
  必ず以下の JSON Schema に厳密に従って応答してください:
  <schema>
    {
      "type": "object",
      "properties": {
        "agendaItems": { "type": "array", "items": { ... } },
        "qualityIssues": { "type": "array", "items": { "ticketId": "string", "issues": ["string"] } },
        "summary": { "type": "string" }
      },
      "required": ["agendaItems", "summary"]
    }
  </schema>
</output_format>
```

### 7-2. 事前充填 (Prefill)

assistant 側を一部埋めて続きを書かせる。「JSONで返して」と言うより「`{` まで書いて、続きを書かせる」方が確実。

```
assistant: {
  "agendaItems": [
```

### 7-3. パース・検証
出力をTSの zod / Pythonの Pydantic で検証する。失敗したら **再プロンプト** ではなく **prompt自体を直す**。

---

## 8. 制約 (Rules) と Don't ルール

### 必ず書くべき rules
```xml
<rules>
  <rule>根拠IDは必ず EP-xxx / US-xxx / WC-xxx (デフォルト Project=Belvedere Core, 他は ${idPrefix}-${number}) / slack:Cxx:Txx / gh:org/repo#nn 形式で引用すること</rule>
  <rule>知らないことは推測せず、human.ask ツールで人間に投げること</rule>
  <rule>Firestore書込み前に dry_run = true で確認 (L2 自律性レベル準拠)</rule>
  <rule>出力言語は日本語</rule>
</rules>
```

### Don'tリスト
肯定形より否定形のほうが効くケース:
```xml
<dont>
  <item>seed の WC-101..112 / EP-1..4 / US-101..US-402 を編集してはいけない</item>
  <item>議題に「気合で頑張る」のような実行可能でない項目を入れない</item>
  <item>不確実な事実を断定形で書かない</item>
</dont>
```

---

## 9. 拡張機能 (Production)

### 9-1. Prompt caching (Vertex AI Gemini)

**system prompt + Few-shot examples** は儀式エージェント間で大半が共通。
これを cached content として登録すると、入力トークンコストが大幅に減る (Anthropic は ~90% off / Gemini も同等の機構あり)。

Belvedere のキャッシュ戦略:
- **共通レイヤ**: 用語集 + Belvedere プロジェクトの世界観 → 全エージェント共有
- **役割レイヤ**: 各儀式の役割定義 + Few-shot examples → エージェント毎にキャッシュ
- **動的レイヤ**: 当日のチケット / Sprint 状態 / Epic 進捗 → キャッシュしない

### 9-2. Extended thinking
Plannerのような複雑判断は thinking モードを有効にしてトークン上限を緩める (Geminiの thinkingConfig: `{ thinkingBudget: 4096 }` 等)。

### 9-3. Prompt chaining
1つのプロンプトでぜんぶやらせない。`Planner -> Reviewer` のような連鎖は ADK で構成する (オーケストレータが中継)。

---

## 10. Belvedere プロジェクト固有のチェックリスト

新しいエージェントプロンプトを書くとき、または既存を改訂するときに次を満たすこと。**全部 ✅ になるまで Subagent prompt-quality-reviewer がブロックする想定。**

### 必須 (満たさない = リジェクト)
- [ ] role / task / output_format の3要素が明示
- [ ] XMLタグで構造化されている (Markdown 見出しのみは NG)
- [ ] 英語 Agent 名 (Planner Agent / Refinement Agent / Daily Agent / Reviewer Agent / Retrospective Agent / Orchestrator) と プロダクト名 Belvedere が含まれている (Mock LLM の正規表現が依存)
- [ ] 出力言語 = 日本語が指定されている
- [ ] EP-xxx / US-xxx / WC-xxx の引用ルールが書かれている (Project ごとに idPrefix 可変)
- [ ] 廃止済キーワード (北翼/東翼/南翼/西翼/WindEvent/WingScore/風車/Kazaguruma/価値タグ) が混入していない
- [ ] human.ask の使い方が書かれている (不確実時の振る舞い)

### 推奨
- [ ] Few-shot examples が 2〜5件
- [ ] reasoning ブロックで思考順序を明示
- [ ] 出力スキーマが JSON Schema で書かれている
- [ ] don't ルールが書かれている

### 高度 (本番デプロイ時)
- [ ] Prompt caching の対象範囲が定義されている
- [ ] Extended thinking が必要な処理を識別している
- [ ] eval set が用意されている (好ましい応答 / NG応答 各5件以上)

---

## 11. 参考リンク

- [Prompting 101 (YouTube)](https://www.youtube.com/watch?v=ysPbXH0LpIE)
- [Anthropic Prompt Engineering Best Practices](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- [Anthropic Interactive Prompt Engineering Tutorial (GitHub)](https://github.com/anthropics/prompt-eng-interactive-tutorial)
- Belvedere 内: `AGENT_DESIGN.md` (役割設計) / `packages/agent/src/prompts.ts` (TS実装) / `apps/orchestrator-py/src/orchestrator/agents.py` (Python ADK実装)
