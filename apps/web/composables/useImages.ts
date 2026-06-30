// 画像アップロード / 認証付き表示 (WC-a8f0be16)。
// upload: data URL を POST /api/images → 参照 id。
// objectUrl: GET /api/images/:id を Bearer 付きで blob 取得 → object URL (<img> は Bearer を送れないため)。
//   解決済 URL は useState でキャッシュ (同じ画像を何度も fetch しない)。

export const useImages = () => {
  const api = useApiClient();
  const cache = useState<Record<string, string>>('image-blob-cache', () => ({}));

  /** data URL の画像を保存し参照 id を返す。失敗は null。 */
  async function upload(dataUrl: string): Promise<string | null> {
    try {
      const r = await api.post<{ id: string }>('/api/images', { dataUrl });
      return r.id;
    } catch {
      return null;
    }
  }

  /** id の画像を認証付きで取得し object URL を返す (キャッシュ)。失敗は null。 */
  async function objectUrl(id: string): Promise<string | null> {
    const cached = cache.value[id];
    if (cached) return cached;
    try {
      const blob = await api.get<Blob>(`/api/images/${encodeURIComponent(id)}`, { responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      cache.value = { ...cache.value, [id]: url };
      return url;
    } catch {
      return null;
    }
  }

  return { upload, objectUrl };
};
