// AI パネルのメッセージを安全に markdown 描画する純粋関数 (P4 / SSR 安全 / 依存ゼロ)。
//
// XSS 対策: 生 HTML を一切通さない。まず HTML エンティティを完全エスケープし、その後
// markdown 記法だけを許可リスト方式で <tag> に変換する。
// marked/DOMPurify を使わない理由: DOMPurify は DOM を要し Nuxt SSR で扱いが面倒なため。
// 先に全エスケープするので、AI が返した <script> 等はテキスト化され注入できない。

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

// 安全な URL だけリンク化 (http/https/mailto のみ)。javascript: 等は null → プレーンテキスト扱い。
function safeHref(url: string): string | null {
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : null;
}

// インライン記法 (既にエスケープ済みの 1 行に適用する)。
function renderInline(escaped: string): string {
  let s = escaped;
  // inline code `x` (先に処理して中の記号を保護)
  s = s.replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`);
  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    const href = safeHref(url);
    return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
  });
  // bold **x**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italic *x* (bold の後 / 直前が * でない場合のみ)
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s;
}

/**
 * markdown 文字列を安全な HTML に変換する。見出し (#..###) / 箇条書き (-,*,数字.) /
 * コードフェンス (```) / インライン (bold・code・link) / 段落・改行に対応。
 * 生 HTML はすべてエスケープ済みなので v-html で描画してよい。
 */
export function renderMarkdownSafe(md: string): string {
  const escaped = escapeHtml(md ?? '');
  const lines = escaped.split('\n');
  const html: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const closeList = (): void => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const line of lines) {
    if (/^```/.test(line)) {
      if (inCode) {
        html.push(`<pre><code>${codeBuf.join('\n')}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeList();
      const lvl = h[1]!.length;
      html.push(`<h${lvl}>${renderInline(h[2]!)}</h${lvl}>`);
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (listType !== 'ul') {
        closeList();
        html.push('<ul>');
        listType = 'ul';
      }
      html.push(`<li>${renderInline(ul[1]!)}</li>`);
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (listType !== 'ol') {
        closeList();
        html.push('<ol>');
        listType = 'ol';
      }
      html.push(`<li>${renderInline(ol[1]!)}</li>`);
      continue;
    }

    if (line.trim() === '') {
      closeList();
      continue;
    }

    closeList();
    html.push(`<p>${renderInline(line)}</p>`);
  }

  if (inCode) html.push(`<pre><code>${codeBuf.join('\n')}</code></pre>`); // 未閉じ fence を救済
  closeList();
  return html.join('\n');
}
