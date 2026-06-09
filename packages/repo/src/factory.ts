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
      try {
        const { createFirestoreRepoContainer } = await import('./firestore');
        return createFirestoreRepoContainer();
      } catch (e) {
        // 動的 import 失敗時 (例: @google-cloud/firestore の未インストール、ESM 解決失敗) は
        // 黙って memory backend に fallback せず、修復手段を明示して throw する。
        // 実 read/write 時の ADC 失敗 / IAM 権限不足は db() lazy singleton で初めて起き、
        // ここでは検出できないため、対応手順を両ケース併記しておく。
        const cause = e instanceof Error ? e.message : String(e);
        throw new Error(
          `[repo] firestore backend の初期化に失敗しました。\n` +
            `  原因: ${cause}\n` +
            `  対応:\n` +
            `    1. ローカル開発で試す場合は REPO_BACKEND=memory に切り替える\n` +
            `       (例: REPO_BACKEND=memory pnpm --filter @belvedere/api dev)\n` +
            `    2. 本気で Firestore に繋ぐ場合は\n` +
            `       (a) gcloud auth application-default login で ADC を設定\n` +
            `       (b) Cloud Run の場合は runtime SA に roles/datastore.user 権限を付与\n` +
            `       (c) GCP_PROJECT 環境変数が正しい project ID か確認`,
        );
      }
    }
    case 'memory':
    case undefined:
    case '':
      return createMemoryRepoContainer();
    default:
      throw new Error(`[repo] unknown backend: ${backend}`);
  }
}
