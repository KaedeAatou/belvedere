// image-handlers の純粋関数 parseImageDataUrl の単体テスト (WC-a8f0be16)。
// GCS I/O (uploadImage/readImage) は firebase-admin/storage 依存なので別 (実機/smoke) で見る。
import { describe, it, expect } from 'vitest';
import { parseImageDataUrl } from '../src/handlers/image-handlers';

// 1x1 透明 PNG。
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('parseImageDataUrl (WC-a8f0be16)', () => {
  it('有効な png data URL を分解する', () => {
    const r = parseImageDataUrl(`data:image/png;base64,${PNG}`);
    expect(r).not.toBeNull();
    expect(r!.contentType).toBe('image/png');
    expect(r!.ext).toBe('png');
    expect(r!.bytes.length).toBeGreaterThan(0);
  });
  it('jpeg は ext=jpg に正規化', () => {
    expect(parseImageDataUrl(`data:image/jpeg;base64,${PNG}`)?.ext).toBe('jpg');
  });
  it('非許可 MIME (svg = XSS リスク) は null', () => {
    expect(parseImageDataUrl(`data:image/svg+xml;base64,${PNG}`)).toBeNull();
  });
  it('data URL でない文字列は null', () => {
    expect(parseImageDataUrl('https://evil.example.com/x.png')).toBeNull();
  });
  it('空 base64 は null', () => {
    expect(parseImageDataUrl('data:image/png;base64,')).toBeNull();
  });
});
