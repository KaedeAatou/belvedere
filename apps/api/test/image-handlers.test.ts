// image-handlers の純粋関数 parseImageDataUrl の単体テスト (WC-a8f0be16)。
// GCS I/O (uploadImage/readImage) は firebase-admin/storage 依存なので別 (実機/smoke) で見る。
import { describe, it, expect } from 'vitest';
import { parseImageDataUrl } from '../src/handlers/image-handlers';

// 1x1 透明 PNG (magic 89 50 4E 47…)。
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
// 最小 1x1 JPEG (magic FF D8 FF…)。マジックバイト検証で PNG と区別されることの確認に使う。
const JPEG =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD/2Q==';

describe('parseImageDataUrl (WC-a8f0be16)', () => {
  it('有効な png data URL を分解する', () => {
    const r = parseImageDataUrl(`data:image/png;base64,${PNG}`);
    expect(r).not.toBeNull();
    expect(r!.contentType).toBe('image/png');
    expect(r!.ext).toBe('png');
    expect(r!.bytes.length).toBeGreaterThan(0);
  });
  it('jpeg は ext=jpg に正規化', () => {
    expect(parseImageDataUrl(`data:image/jpeg;base64,${JPEG}`)?.ext).toBe('jpg');
  });
  it('非許可 MIME (svg = XSS リスク) は null', () => {
    expect(parseImageDataUrl(`data:image/svg+xml;base64,${PNG}`)).toBeNull();
  });
  // security review LOW (2026-07-09): 宣言 MIME と実バイトが食い違う偽装を弾く。
  it('マジックバイト不一致 (jpeg 宣言だが PNG バイト) は null', () => {
    expect(parseImageDataUrl(`data:image/jpeg;base64,${PNG}`)).toBeNull();
  });
  it('マジックバイト不一致 (png 宣言だが JPEG バイト) は null', () => {
    expect(parseImageDataUrl(`data:image/png;base64,${JPEG}`)).toBeNull();
  });
  it('画像でない任意バイト (png 宣言だが zero bytes) は null', () => {
    // "AAAA" = 0x00000003 相当の非 PNG バイト
    expect(parseImageDataUrl('data:image/png;base64,AAAAAAAA')).toBeNull();
  });
  it('data URL でない文字列は null', () => {
    expect(parseImageDataUrl('https://evil.example.com/x.png')).toBeNull();
  });
  it('空 base64 は null', () => {
    expect(parseImageDataUrl('data:image/png;base64,')).toBeNull();
  });
});
