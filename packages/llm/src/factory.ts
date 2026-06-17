import type { LLMProvider } from './provider';
import { MockLLMProvider } from './mock';
import { GeminiLLMProvider } from './gemini';

export type LLMProviderName = 'mock' | 'gemini' | 'vertex';

/**
 * env LLM_PROVIDER で切り替える。
 * - mock (既定): MockLLMProvider (役割判定の決定的応答)
 * - gemini: GeminiLLMProvider (Gemini API / GEMINI_API_KEY 必須。未設定なら constructor が throw)
 * - vertex: 未採用 (Gemini API キー方式を採用 / 2026-06-17)。明示 throw で signpost
 */
export function createLLMProvider(name: LLMProviderName | string | undefined = process.env.LLM_PROVIDER): LLMProvider {
  switch (name) {
    case 'gemini':
      return new GeminiLLMProvider({ apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '' });
    case 'vertex':
      throw new Error(`[llm] provider "vertex" は未採用。LLM_PROVIDER=gemini (Gemini API) か mock を使ってください。`);
    case 'mock':
    case undefined:
    case '':
      return new MockLLMProvider();
    default:
      throw new Error(`[llm] unknown provider: ${name}`);
  }
}
