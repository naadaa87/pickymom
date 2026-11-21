// 데이터베이스(D1) 표
// 처음 요청이 들어올 때 저절로 만들어져요. SQL을 따로 실행하지 않아도 돼요.

const SCHEMA_VERSION = '1';

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`,
  // 글: 리뷰(review)와 살림 일기(diary)
  `CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'review',
    slug TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    downside TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    item TEXT NOT NULL DEFAULT '',
    period TEXT NOT NULL DEFAULT '',
    acquired TEXT NOT NULL DEFAULT 'own',
    cover_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    publish_at TEXT NOT NULL DEFAULT '',
    checklist_ok INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    refreshed_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS posts_pub ON posts (status, publish_at)`,
  // 픽키 카드(제품). 리뷰 하나에 여러 개가 붙을 수 있어요(비교 글).
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL DEFAULT '',
    bought_at TEXT NOT NULL DEFAULT '',
    price_band TEXT NOT NULL DEFAULT '',
    shop TEXT NOT NULL DEFAULT '',
    photo_id TEXT NOT NULL DEFAULT '',
    verdict TEXT NOT NULL DEFAULT 'maybe',
    stage TEXT NOT NULL DEFAULT 'first',
    one_line TEXT NOT NULL DEFAULT '',
    in_use TEXT NOT NULL DEFAULT 'yes',
    link_url TEXT NOT NULL DEFAULT '',
    link_checked TEXT NOT NULL DEFAULT '',
    link_broken INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS products_post ON products (post_id, sort)`,
  // 깐깐 체크
  `CREATE TABLE IF NOT EXISTS checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    label TEXT NOT NULL DEFAULT '',
    mark TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS checks_product ON checks (product_id, sort)`,
  // 다시 쓰는 후기
  `CREATE TABLE IF NOT EXISTS followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    point TEXT NOT NULL DEFAULT 'other',
    day TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    in_use TEXT NOT NULL DEFAULT '',
    verdict TEXT NOT NULL DEFAULT '',
    skipped INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS followups_product ON followups (product_id, day)`,
  // 준비물 목록
  `CREATE TABLE IF NOT EXISTS lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    intro TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    sort INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS list_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    grp TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'choosing',
    note TEXT NOT NULL DEFAULT '',
    post_id INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS list_items_list ON list_items (list_id, sort)`,
  // 사진 (R2를 연결하지 않았을 때 여기에 저장)
  `CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    mime TEXT NOT NULL DEFAULT 'image/jpeg',
    data TEXT NOT NULL DEFAULT '',
    w INTEGER NOT NULL DEFAULT 0,
    h INTEGER NOT NULL DEFAULT 0,
    bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ''
  )`,
  // 구매 링크 클릭 수 (날짜별 합계만. 누가 눌렀는지는 남기지 않아요)
  `CREATE TABLE IF NOT EXISTS clicks (
    product_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, day)
  )`,
  // 로그인 실패 같은 기록 (이틀 뒤 지워요)
  `CREATE TABLE IF NOT EXISTS actions (k TEXT, act TEXT, created_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS actions_k ON actions (k, act, created_at)`,
];

let ready = false;

export async function ensureSchema(env) {
  if (ready) return true;
  if (!env.DB) return false;
  try {
    const row = await env.DB.prepare(`SELECT v FROM meta WHERE k = 'schema'`).first();
    if (row && row.v === SCHEMA_VERSION) { ready = true; return true; }
  } catch (e) { /* 아직 표가 없어요 */ }
  await env.DB.batch(STATEMENTS.map((s) => env.DB.prepare(s)));
  await env.DB.prepare(`INSERT INTO meta (k, v) VALUES ('schema', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v`).bind(SCHEMA_VERSION).run();
  await env.DB.prepare(`INSERT INTO meta (k, v) VALUES ('ver', '1') ON CONFLICT (k) DO NOTHING`).run();
  ready = true;
  return true;
}

// 글을 고칠 때마다 올려요. 공개 화면 캐시가 이 숫자로 새로 만들어져요.
export async function bumpVersion(env) {
  await env.DB.prepare(`INSERT INTO meta (k, v) VALUES ('ver', '1') ON CONFLICT (k) DO UPDATE SET v = CAST(CAST(v AS INTEGER) + 1 AS TEXT)`).run();
}
export async function contentVersion(env) {
  const row = await env.DB.prepare(`SELECT v FROM meta WHERE k = 'ver'`).first();
  return row ? row.v : '0';
}
