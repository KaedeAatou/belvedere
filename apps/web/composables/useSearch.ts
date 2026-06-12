// ⌘K 検索 composable (T-1 / 2026-06-12)。
// タイトル / ID のクライアント側部分一致検索。useState で isOpen を共有し、
// Shell.vue からキーボードイベントで開閉、結果選択で DetailSheet を起動する。

import type { Ticket } from '@belvedere/shared';

export const useSearch = () => {
  const isOpen = useState<boolean>('search-open', () => false);
  const query = useState<string>('search-query', () => '');

  function open(): void {
    query.value = '';
    isOpen.value = true;
  }

  function close(): void {
    isOpen.value = false;
    query.value = '';
  }

  function toggle(): void {
    if (isOpen.value) close();
    else open();
  }

  function filter(tickets: Ticket[]): Ticket[] {
    const q = query.value.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    );
  }

  return { isOpen, query, open, close, toggle, filter };
};
