#!/usr/bin/env tsx
// Debug script: robot user の Firebase token で /api/me と /api/tickets を叩いて違いを確認
// 使い方: cd apps/e2e && FIREBASE_SA_KEY=$(...) E2E_ROBOT_UID=$(...) tsx utils/debug-api.ts

import { mintCustomToken } from './firebase-admin';

async function main(): Promise<void> {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'https://belvedere-api-dev-cpszmcqmuq-an.a.run.app';
  const uid = process.env.E2E_ROBOT_UID;
  if (!uid) throw new Error('E2E_ROBOT_UID not set');

  console.log(`API: ${apiBaseUrl}`);
  console.log(`UID: ${uid}`);

  const customToken = await mintCustomToken(uid);
  const apiKey = process.env.FIREBASE_WEB_API_KEY ?? 'AIzaSyCwtYyHcGwuspL_TWyw6qN6PHxvuLGW3AA';

  const exch = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  if (!exch.ok) {
    console.error('token exchange failed:', exch.status, await exch.text());
    process.exit(1);
  }
  const { idToken } = (await exch.json()) as { idToken: string };

  // 5 endpoint 叩く
  for (const path of ['/api/whoami', '/api/me', '/api/tickets', '/api/sprints', '/api/epics']) {
    const r = await fetch(`${apiBaseUrl}${path}`, { headers: { Authorization: `Bearer ${idToken}` } });
    const body = await r.text();
    const preview = body.length > 200 ? body.slice(0, 200) + '...' : body;
    console.log(`\n${path}: HTTP ${r.status}\n  ${preview}`);
  }
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
