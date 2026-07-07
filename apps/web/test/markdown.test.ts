// renderMarkdownSafe の unit test (P4 / 2026-07-07)。
// 依存ゼロ・SSR 安全の markdown→HTML 変換。最重要は XSS (生 HTML を通さない) の固定。

import { describe, it, expect } from 'vitest';
import { renderMarkdownSafe } from '~/utils/markdown';

describe('renderMarkdownSafe', () => {
  it('生 HTML はエスケープして通さない (XSS 防止)', () => {
    const out = renderMarkdownSafe('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('img onerror 等の属性注入もテキスト化される', () => {
    const out = renderMarkdownSafe('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('見出し # ## ### を h1/h2/h3 に', () => {
    expect(renderMarkdownSafe('# 見出し')).toContain('<h1>見出し</h1>');
    expect(renderMarkdownSafe('### 小見出し')).toContain('<h3>小見出し</h3>');
  });

  it('bold と inline code', () => {
    expect(renderMarkdownSafe('**強調**')).toContain('<strong>強調</strong>');
    expect(renderMarkdownSafe('`WC-101`')).toContain('<code>WC-101</code>');
  });

  it('箇条書き (- / *) を ul>li に', () => {
    const out = renderMarkdownSafe('- 一つ目\n- 二つ目');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>一つ目</li>');
    expect(out).toContain('<li>二つ目</li>');
    expect(out).toContain('</ul>');
  });

  it('番号付きリストを ol>li に', () => {
    const out = renderMarkdownSafe('1. A\n2. B');
    expect(out).toContain('<ol>');
    expect(out).toContain('<li>A</li>');
    expect(out).toContain('</ol>');
  });

  it('安全な http リンクは a 化 / javascript: はプレーンテキスト', () => {
    const safe = renderMarkdownSafe('[docs](https://example.com)');
    expect(safe).toContain('<a href="https://example.com"');
    expect(safe).toContain('rel="noopener noreferrer"');

    const unsafe = renderMarkdownSafe('[x](javascript:alert(1))');
    expect(unsafe).not.toContain('<a ');
    expect(unsafe).not.toContain('javascript:alert'); // href 化しない
  });

  it('コードフェンスは pre>code にまとめる (中の記号は素通し)', () => {
    const out = renderMarkdownSafe('```\nconst x = 1 < 2;\n```');
    expect(out).toContain('<pre><code>');
    expect(out).toContain('const x = 1 &lt; 2;');
    expect(out).toContain('</code></pre>');
  });

  it('空入力は空文字 (退化入力)', () => {
    expect(renderMarkdownSafe('')).toBe('');
  });
});
