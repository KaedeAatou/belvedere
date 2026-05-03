import type { LLMProvider } from './provider';
import { MockLLMProvider } from './mock';

export type LLMProviderName = 'mock' | 'gemini' | 'vertex';

/**
 * env LLM_PROVIDER で切り替える。
 * 現状は mock のみ実装。gemini/vertex は GCP セットアップ完了後に追加。
 */
export function createLLMProvider(name: LLMProviderName | string | undefined = process.env.LLM_PROVIDER): LLMProvider {
  switch (name) {
    case 'gemini':
    case 'vertex':
      throw new Error(`[llm] provider "${name}" は未実装。GCPセットアップ後に追加します。今は LLM_PROVIDER=mock で進めてください。`);
    case 'mock':
    case undefined:
    case '':
      return new MockLLMProvider();
    default:
      throw new Error(`[llm] unknown provider: ${name}`);
  }
}
