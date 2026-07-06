# Firestore Security Rules deploy 手順 (Phase 1-B)

> 2026-06-10 作成 / 想定所要 5 分 / 個人 Google アカウント `owner@example.com` で実施

## なぜユーザー操作が必要か

Firestore Rules を deploy するには `roles/firebaserules.admin` (Rules の書き換え権限) が必要だが、
Cloud Run の runtime SA (`belvedere-runtime`) は意図的にこの権限を持っていない。
これはユーザー個人の権限でしか実行できない設計。

## 何のためのファイル?

`infra/firestore.rules` は **「ブラウザから Firestore SDK で直接データを抜こうとした攻撃を block する」ラストガード**。

```
API 経由 (今の Belvedere の流れ):
  ブラウザ → API (auth middleware) → Firestore Admin SDK → Firestore
                                      ↑ Admin SDK は Rules を bypass

直叩き (これを block したい):
  ブラウザ → Firestore (← Rules で if false = 拒否)
```

最小実装: 全コレクションを `allow read, write: if false` で完全保護。
API 経由は Admin SDK で動作するので影響なし。

Phase 1-C 以降で UI から `onSnapshot` で読み取りリアルタイム同期を実装する場合は、
該当コレクションだけ workspace ベースの read allow に緩める想定。

---

## STEP 1: Firebase CLI を install (初回のみ / 2 分)

```bash
npm install -g firebase-tools

# 個人 Google アカウントでログイン
firebase login
# → ブラウザが開く → owner@example.com を選択 → 承認
```

確認:

```bash
firebase login:list
# 出力に owner@example.com が表示されれば OK
```

⚠ 会社アカウント (会社ドメインのメール) で誤ってログインしたら `firebase logout` で必ず削除。

---

## STEP 2: プロジェクトを指定 (30 秒)

```bash
cd ~/Projects/ai-agent-hackathon/infra

firebase use belvedere-dev-atrium
# → "Now using project belvedere-dev-atrium" が出れば OK
```

---

## STEP 3: Rules を deploy (1 分)

⚠ **必ず `infra/` ディレクトリで実行する** (`firebase.json` がここにあるため)。
リポジトリのルートで叩くと `Not in a Firebase app directory (could not locate firebase.json)` で失敗する。
`infra/.firebaserc` で default project = `belvedere-dev-atrium` を pin 済みなので STEP 2 の `firebase use` は省略可。

```bash
cd ~/Projects/ai-agent-hackathon/infra
firebase deploy --only firestore:rules
```

成功すると以下のような出力:

```
=== Deploying to 'belvedere-dev-atrium'...

i  deploying firestore
i  firestore: reading rules from firestore.rules...
✔  firestore: rules file firestore.rules compiled successfully
i  firestore: uploading rules firestore.rules...
✔  firestore: released rules firestore.rules to cloud.firestore

✔  Deploy complete!
```

---

## STEP 4: 動作確認 (1 分)

Firebase Console → Firestore → Rules タブで、deploy した内容が反映されていることを確認:

```
https://console.firebase.google.com/project/belvedere-dev-atrium/firestore/rules
```

「rules_version = '2'」と「allow read, write: if false」が見えれば OK。

API 経由のリクエスト (`/api/whoami` 等) は引き続き動作する (Admin SDK で bypass されるため)。

---

## 検証: ブラウザから直叩きを試して block されることを確認 (任意)

```javascript
// ブラウザ DevTools console で実行
// Firebase JS SDK を import 済みのページ (Belvedere の任意の画面) で:
const { getFirestore, getDocs, collection } = await import('firebase/firestore');
const db = getFirestore();
try {
  const snap = await getDocs(collection(db, 'tickets'));
  console.log('🚨 BAD: 直叩きで取れてしまった', snap.docs.length);
} catch (e) {
  console.log('✅ GOOD: Rules で block された', e.message);
}
// → "Missing or insufficient permissions" が出れば成功
```

---

## Phase 1-C 以降の変更タイミング

`docs/PHASE_1-C.md` が将来できたらそちらを参照。基本方針:

```
Phase 1-C (API 経由 CRUD): if false のまま (現状維持)
Phase 3 余裕あれば (UI Direct read): tickets だけ read allow 緩め、write は if false
```
