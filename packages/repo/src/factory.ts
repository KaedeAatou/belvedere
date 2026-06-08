import type { RepoContainer } from './types';
import { createMemoryRepoContainer } from './memory';

export type RepoBackend = 'memory' | 'firestore';

/**
 * env REPO_BACKEND で切替可能にする。
 * firestore は動的 import — memory モード時に @google-cloud/firestore SDK をロードしない
 * (web の Nitro バンドルに Node-only SDK を引っ張らないため)。よって async。
 */
export async function createRepoContainer(
  backend: RepoBackend | string | undefined = process.env.REPO_BACKEND,
): Promise<RepoContainer> {
  switch (backend) {
    case 'firestore': {
      const { createFirestoreRepoContainer } = await import('./firestore');
      return createFirestoreRepoContainer();
    }
    case 'memory':
    case undefined:
    case '':
      return createMemoryRepoContainer();
    default:
      throw new Error(`[repo] unknown backend: ${backend}`);
  }
}
