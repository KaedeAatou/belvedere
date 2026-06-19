// Gemini ドット名ツール検証 (dev 用)。`ticket.list` 等のドット入り function 名を
// Gemini function calling が受理するか、実 Gemini に 1 回投げて確定する。
//   node --env-file=.env --import tsx packages/llm/scripts/gemini-tool-smoke.ts
import { createLLMProvider } from '../src/index';

const redact = (s: string): string =>
  s.replace(/key=[A-Za-z0-9_\-]+/g, 'key=***').replace(/AIza[A-Za-z0-9_\-]{10,}/g, 'AIza***');

async function main(): Promise<void> {
  const provider = createLLMProvider('gemini');
  const res = await provider.generate({
    model: 'gemini-2.5-flash',
    messages: [
      { role: 'system', content: 'あなたは Belvedere の agent。ユーザー要求に応じて適切な tool を呼ぶ。' },
      { role: 'user', content: '今のスプリントのチケット一覧を取得してください。' },
    ],
    tools: [
      {
        name: 'ticket.list',
        description: 'チケット一覧を取得する',
        parameters: { type: 'object', properties: { sprintId: { type: 'string' } } },
      },
      {
        name: 'sprint.get',
        description: 'スプリント情報を取得する',
        parameters: { type: 'object', properties: {} },
      },
    ],
    temperature: 0,
  });
  console.log('[tool-smoke] SUCCESS ✅ — Gemini がドット名ツール spec を受理 (400 にならず)');
  console.log('[tool-smoke] stop =', res.stop.type);
  if (res.stop.type === 'tool_calls') {
    console.log('[tool-smoke] tool_calls =', JSON.stringify(res.stop.calls.map((c) => ({ name: c.name, args: c.arguments }))));
  } else {
    console.log('[tool-smoke] text =', JSON.stringify(res.text).slice(0, 150));
  }
  console.log('[tool-smoke] usage =', JSON.stringify(res.usage));
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('[tool-smoke] FAILED ❌ (ドット名が原因かもしれない — メッセージ確認)');
  console.error('[tool-smoke] error =', redact(msg));
  process.exit(1);
});
