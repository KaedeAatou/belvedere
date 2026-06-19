// Gemini 疎通スモークテスト (dev 用・use-once)。
// 実行: リポジトリ直下で
//   node --env-file=.env --import tsx packages/llm/scripts/gemini-smoke.ts
// GEMINI_API_KEY を .env から読み (このスクリプトは中身を一切出力しない)、実 Gemini を 1 回叩く。
import { createLLMProvider } from '../src/index';

const redact = (s: string): string =>
  s.replace(/key=[A-Za-z0-9_\-]+/g, 'key=***').replace(/AIza[A-Za-z0-9_\-]{10,}/g, 'AIza***');

async function main(): Promise<void> {
  const provider = createLLMProvider('gemini');
  console.log('[smoke] provider =', provider.name);
  const res = await provider.generate({
    model: 'gemini-2.5-flash',
    messages: [
      { role: 'system', content: 'You are a connectivity test for Belvedere. Reply very concisely.' },
      { role: 'user', content: '疎通確認中です。「OK」とだけ日本語で短く返してください。' },
    ],
    temperature: 0,
  });
  console.log('[smoke] SUCCESS ✅ — Gemini に接続できました');
  console.log('[smoke] text  =', JSON.stringify(res.text).slice(0, 200));
  console.log('[smoke] stop  =', res.stop.type);
  console.log('[smoke] usage =', JSON.stringify(res.usage));
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('[smoke] FAILED ❌');
  console.error('[smoke] error =', redact(msg));
  process.exit(1);
});
