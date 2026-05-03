import type { RepoContainer } from './types';
import { createMemoryRepoContainer } from './memory';

export type RepoBackend = 'memory' | 'firestore';

/**
 * env REPO_BACKEND で切替可能にする。
 * 現状は memory のみ。Firestore 実装は GCP セットアップ後に追加。
 */
export function createRepoContainer(backend: RepoBackend | string | undefined = process.env.REPO_BACKEND): RepoContainer {
  switch (backend) {
    case 'firestore':
      throw new Error(`[repo] firestore backend は未実装。GCPセットアップ後に追加します。今は REPO_BACKEND=memory で進めてください。`);
    case 'memory':
    case undefined:
    case '':
      return createMemoryRepoContainer();
    default:
      throw new Error(`[repo] unknown backend: ${backend}`);
  }
}
