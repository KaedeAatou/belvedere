// 画像アップロード handler (WC-a8f0be16)。Cloud Storage に保存し API プロキシで配信する。
//
// 設計:
// - 配信は API プロキシ (GET /api/images/:id)。bucket は非公開、runtime SA の storage.objectUser で
//   read/write する (追加 IAM 不要 / 署名 URL 不要)。<img> は Bearer を送れないので web は API クライアントで
//   blob fetch して object URL で表示する (認証維持)。
// - bucket 名は `${GCP_PROJECT}-uploads` で env から導出 (新 env 不要)。GCP_PROJECT 未設定 (memory ローカル) は 400。
// - IDOR: GCS パスは `${workspaceId}/${id}`。read は ctx.workspaceId 配下のみ参照 (URL の id にも workspaceId を
//   含めない → 別 ws の画像は構造的に読めない)。

import { getStorage } from 'firebase-admin/storage';
import { generateId } from '@belvedere/shared';
import { can, forbidden } from '../permissions';
import type { HandlerContext, HandlerResult } from './ticket-handlers';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function bucketName(): string | null {
  const p = process.env.GCP_PROJECT;
  return p ? `${p}-uploads` : null;
}

/**
 * data URL (`data:image/png;base64,xxxx`) を検証して {contentType, bytes, ext} に分解する純粋関数。
 * 不正な形式 / 非許可 MIME は null。サイズ上限チェックは呼び出し側 (bytes.length)。
 */
export function parseImageDataUrl(s: string): { contentType: string; bytes: Buffer; ext: string } | null {
  const m = /^data:([a-zA-Z/+.-]+);base64,(.+)$/.exec(s);
  if (!m) return null;
  const contentType = m[1]!.toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) return null;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(m[2]!, 'base64');
  } catch {
    return null;
  }
  if (bytes.length === 0) return null;
  const ext = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1]!;
  return { contentType, bytes, ext };
}

/** POST /api/images — data URL の画像を Cloud Storage に保存し、参照 id を返す。 */
export async function uploadImage(ctx: HandlerContext, body: unknown): Promise<HandlerResult<{ id: string }>> {
  if (!can('ticket.write', ctx)) {
    return { ok: false, status: 403, body: forbidden('ticket.write') };
  }
  const bn = bucketName();
  if (!bn) {
    return { ok: false, status: 400, body: { error: 'storage_not_configured' } };
  }
  const dataUrl = (body as { dataUrl?: unknown } | null)?.dataUrl;
  if (typeof dataUrl !== 'string') {
    return { ok: false, status: 400, body: { error: 'invalid_body' } };
  }
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) {
    return { ok: false, status: 400, body: { error: 'invalid_image' } };
  }
  if (parsed.bytes.length > MAX_BYTES) {
    return { ok: false, status: 400, body: { error: 'image_too_large' } };
  }
  // 公開 id は flat (ws prefix を含めない)。GCS パスは ctx.workspaceId 配下に置く (IDOR 防御)。
  const id = `${generateId('img')}.${parsed.ext}`;
  const objectPath = `${ctx.workspaceId}/${id}`;
  await getStorage()
    .bucket(bn)
    .file(objectPath)
    .save(parsed.bytes, { contentType: parsed.contentType, resumable: false });
  return { ok: true, status: 201, body: { id } };
}

/**
 * GET /api/images/:id の本体 — ctx.workspaceId 配下のオブジェクトを取得する。
 * 別 ws / 不在 / storage 未設定は null (route が 404)。バイナリ返却のため HandlerResult は使わない。
 */
export async function readImage(ctx: HandlerContext, id: string): Promise<{ contentType: string; bytes: Buffer } | null> {
  const bn = bucketName();
  if (!bn) return null;
  // id は flat (ws prefix なし) 前提。パスは ctx 由来の workspaceId で構成 → 別 ws の画像は読めない。
  const safeId = id.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeId || safeId !== id) return null;
  const file = getStorage().bucket(bn).file(`${ctx.workspaceId}/${safeId}`);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [meta] = await file.getMetadata();
  const [bytes] = await file.download();
  return { contentType: typeof meta.contentType === 'string' ? meta.contentType : 'application/octet-stream', bytes };
}
