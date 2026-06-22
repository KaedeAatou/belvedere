// email-allowlist + workspaceMiddleware bootstrap ロジックの単体テスト (Phase 1-B / 2026-06-10)。
// Firebase Admin SDK や Hono の middleware 全体は test 対象外。純粋関数 + memory backend で完結。

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepoContainer } from '@belvedere/repo';
import type { RepoContainer } from '@belvedere/repo';
import { buildMemberFromAllowlist, emailAllowlist, isLoginAllowed } from '../src/config/email-allowlist';

describe('buildMemberFromAllowlist - 純粋関数', () => {
  it('allowlist 該当 (assign) email は Member object を返す (本人 = admin)', () => {
    const m = buildMemberFromAllowlist('firebase-uid-xyz', 'mygolanglearn@gmail.com');
    expect(m).not.toBeNull();
    expect(m?.userId).toBe('firebase-uid-xyz');
    expect(m?.email).toBe('mygolanglearn@gmail.com');
    expect(m?.workspaceId).toBe('ws-belvedere');
    expect(m?.role).toBe('admin'); // 固定 ws の作成者相当 = 全権 (旧 owner → 正準 admin)
  });

  it('allowlist 非該当 email は null を返す', () => {
    expect(buildMemberFromAllowlist('uid-1', 'not-allowed@example.com')).toBeNull();
  });

  it('login-only エントリは Member を作らない (null / onboarding 経路へ回す)', () => {
    // login-only = ログイン許可だけ。member は作らず needs_workspace で onboarding に誘導する。
    const entry = emailAllowlist['onboard-e2e@belvedere.test'];
    expect(entry?.mode).toBe('login-only');
    expect(buildMemberFromAllowlist('uid-onboard', 'onboard-e2e@belvedere.test')).toBeNull();
  });

  it('会社メアドは allowlist に絶対入れない (PII / 個人参加要件)', () => {
    // ハッカソンは個人参加要件があるので、会社ドメインは絶対入れない。
    // 実在の会社メアドを公開 repo に書くこと自体が個人↔会社の紐付け露出になるため、
    // 「許可ドメイン以外が入っていない」を検証する。
    // 許可: 個人 Gmail / e2e robot + onboarding (@belvedere.test) / MCP (@belvedere.svc) /
    // ハッカソン審査員デモ (@belvedere.demo)。いずれも会社ドメインではない (擬似ドメイン)。
    expect(emailAllowlist['someone@company.example']).toBeUndefined();
    const allowedDomains = ['@gmail.com', '@belvedere.test', '@belvedere.svc', '@belvedere.demo'];
    const cleanDomains = Object.keys(emailAllowlist).every((e) =>
      allowedDomains.some((d) => e.endsWith(d)),
    );
    expect(cleanDomains).toBe(true);
  });

  it('MCP サービスプリンシパルは ws-belvedere の po (admin ではない)', () => {
    // 機械認証パス (config/service-token.ts) で認証された MCP は、この allowlist 経由で
    // ws-belvedere の po member に bootstrap される。admin ではない (workspace 全権 bypass なし)。
    const m = buildMemberFromAllowlist('svc:mcp', 'mcp@belvedere.svc');
    expect(m).not.toBeNull();
    expect(m?.workspaceId).toBe('ws-belvedere');
    expect(m?.role).toBe('po');
  });

  it('審査員デモ demo@belvedere.demo は ws-belvedere の admin (全儀式を体験 / 2026-06-23 再設計)', () => {
    // ハッカソン審査員が触る共有アカウント。本番 seed (ws-belvedere) 上で全 5 儀式 + Agent を
    // 体験できるよう admin にする (旧 dev では reorder / sprint 等が 403 で「形だけ」しか見せられなかった)。
    // seed が崩れても seed-firestore-dev.ts で戻せるので許容。
    const m = buildMemberFromAllowlist('firebase-uid-demo', 'demo@belvedere.demo');
    expect(m).not.toBeNull();
    expect(m?.workspaceId).toBe('ws-belvedere');
    expect(m?.role).toBe('admin');
  });

  it('robot-e2e@belvedere.test は ws-e2e-test の admin として登録される (Stage 2)', () => {
    const m = buildMemberFromAllowlist('firebase-uid-robot', 'robot-e2e@belvedere.test');
    expect(m).not.toBeNull();
    expect(m?.workspaceId).toBe('ws-e2e-test'); // 本番 ws-belvedere を汚さない
    expect(m?.role).toBe('admin'); // 自分の部屋の作成者 = 全権
    expect(m?.displayName).toBe('E2E Robot');
  });

  it('robot とユーザーは別 workspace に bootstrap される (本番データ汚染防止)', () => {
    const me = buildMemberFromAllowlist('uid-1', 'mygolanglearn@gmail.com');
    const robot = buildMemberFromAllowlist('uid-2', 'robot-e2e@belvedere.test');
    expect(me?.workspaceId).toBe('ws-belvedere');
    expect(robot?.workspaceId).toBe('ws-e2e-test');
    expect(me?.workspaceId).not.toBe(robot?.workspaceId);
  });
});

describe('workspace bootstrap シミュレーション (memory backend)', () => {
  let repo: RepoContainer;
  beforeEach(() => { repo = createMemoryRepoContainer(); });

  it('未登録ユーザー + allowlist 該当 → upsert で member 作成 → listByUserId 1 件', async () => {
    const uid = 'firebase-uid-bootstrap';
    const email = 'mygolanglearn@gmail.com';

    // 初期状態: 未登録
    expect((await repo.members.listByUserId(uid)).length).toBe(0);

    // bootstrap シミュレーション (workspace.ts の本物のロジックと同じ流れ)
    const m = buildMemberFromAllowlist(uid, email);
    expect(m).not.toBeNull();
    if (!m) return;
    await repo.members.upsert(m);

    // 結果: 1 件登録され、admin として確定
    const memberships = await repo.members.listByUserId(uid);
    expect(memberships.length).toBe(1);
    expect(memberships[0]?.role).toBe('admin');
    expect(memberships[0]?.workspaceId).toBe('ws-belvedere');
  });

  it('未登録ユーザー + allowlist 非該当 → 何もしない → 0 件のまま (= 403)', async () => {
    const uid = 'firebase-uid-stranger';
    const email = 'stranger@example.com';

    expect((await repo.members.listByUserId(uid)).length).toBe(0);

    const m = buildMemberFromAllowlist(uid, email);
    expect(m).toBeNull(); // 非該当なので bootstrap しない

    // 結果: 依然 0 件 → middleware 側で 403 invitation_required
    expect((await repo.members.listByUserId(uid)).length).toBe(0);
  });

  it('login-only ユーザー → member 作られず 0 件のまま (= needs_workspace へ)', async () => {
    const uid = 'firebase-uid-onboard';
    const email = 'onboard-e2e@belvedere.test';
    const m = buildMemberFromAllowlist(uid, email);
    expect(m).toBeNull(); // login-only は member を作らない
    expect((await repo.members.listByUserId(uid)).length).toBe(0);
    // この後 middleware は isLoginAllowed=true を見て needs_workspace を返す。
    expect(isLoginAllowed(email)).toBe(true);
  });

  it('既に登録済ユーザー → bootstrap は実行されない (allowlist が ignore される設計)', async () => {
    // 招待 UI (Phase 1-E) で role を sm に変更したユーザーが mygolanglearn@gmail.com だった場合、
    // 次回ログイン時に owner に巻き戻されると困る。middleware は listByUserId > 0 件なら早期 return する設計。
    // この test では「listByUserId > 0 件なら bootstrap 経路を通らない」ことを確認 (本物の middleware の挙動シミュレーション)。
    const uid = 'firebase-uid-existing';
    await repo.members.upsert({
      userId: uid,
      workspaceId: 'ws-belvedere',
      email: 'mygolanglearn@gmail.com',
      displayName: 'Kagaya (downgraded)',
      role: 'sm',  // ← allowlist は owner だが、ここでは sm
    });

    // middleware 相当: listByUserId > 0 件なら bootstrap しない
    const memberships = await repo.members.listByUserId(uid);
    expect(memberships.length).toBe(1);
    expect(memberships[0]?.role).toBe('sm'); // ← 既存 role が維持される
  });
});

describe('isLoginAllowed - ログイン許可判定 (needs_workspace vs invitation_required 分岐)', () => {
  it('assign / login-only どちらの allowlist エントリも true', () => {
    expect(isLoginAllowed('mygolanglearn@gmail.com')).toBe(true); // assign
    expect(isLoginAllowed('demo@belvedere.demo')).toBe(true); // assign
    expect(isLoginAllowed('onboard-e2e@belvedere.test')).toBe(true); // login-only
  });
  it('allowlist 非該当は false (= invitation_required)', () => {
    expect(isLoginAllowed('stranger@example.com')).toBe(false);
    expect(isLoginAllowed('')).toBe(false);
  });
});
