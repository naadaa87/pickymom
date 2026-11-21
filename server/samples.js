// 관리 화면 '설정 → 예시 글 넣기'
// 화면이 어떻게 보이는지 확인할 수 있게 초안 상태의 예시 글을 넣어요. 공개되지 않아요.
import { nowIso, kstDay, addMonths } from './util.js';
import { CHECK_DEFAULTS } from './labels.js';

const ago = (months) => addMonths(kstDay(), -months);

// 날짜는 요청 안에서 계산해야 해요(Workers는 요청 밖에서 시계가 1970년이에요).
const reviews = () => [
  {
    title: '[예시] 식기건조대 셋을 써 보고 하나만 남긴 이유',
    slug: 'dish-rack-3',
    category: 'kitchen', item: '세척 도구',
    summary: '좁은 싱크대 옆에서 식기건조대 세 개를 차례로 써 보고, 물때 걱정이 가장 적었던 하나만 남겼어요.',
    body: `싱크대 옆 자리가 좁아서 건조대를 세 번 바꿨어요. 셋 다 직접 사서 몇 달씩 썼고, 지금은 하나만 남았어요.

## 왜 샀나
처음 쓰던 건조대는 받침에 물이 고여서 이틀만 지나도 물때가 생겼어요. 매일 닦기가 번거로웠어요.

## 어떻게 골랐나
- 받침에 물이 고이지 않을 것
- 틈이 적어서 솔로 한 번에 닦일 것
- 싱크대 옆 폭 40cm 안에 들어갈 것

## 써 보니
2단 건조대는 위 칸에 컵, 아래 칸에 그릇을 두니 자리가 확 줄었어요. 물받이가 기울어져 있어서 물이 싱크대 쪽으로 빠져요.`,
    downside: '- 생각보다 폭이 넓어요. 싱크대 옆 폭이 40cm보다 좁으면 다시 재 보세요.\n- 같은 크기의 다른 건조대보다 조금 비싸요.',
    products: [
      { name: '2단 식기건조대 (예시)', bought_at: ago(7), price_band: '3만 원대', shop: '온라인', verdict: 'buy', stage: 'six', in_use: 'yes', one_line: '좁은 싱크대 옆에서 물때 걱정을 덜어 준 건조대',
        checks: [['세척', 'good', '틈이 적어 솔로 한 번에 닦여요'], ['소재와 코팅', 'good', '스테인리스라 녹이 없어요'], ['자리', 'soso', '폭이 생각보다 넓어요'], ['내구', 'good', '일곱 달째 흔들림이 없어요'], ['값', 'soso', '비슷한 것보다 조금 비싸요']] },
      { name: '접이식 식기건조대 (예시)', bought_at: ago(3), price_band: '1만 원대', shop: '마트', verdict: 'maybe', stage: 'month', in_use: 'sometimes', one_line: '접어 두기는 좋지만 매일 쓰기엔 아쉬운 건조대',
        checks: [['세척', 'soso', '접히는 부분에 때가 껴요'], ['자리', 'good', '안 쓸 때 접어 둘 수 있어요'], ['값', 'good', '부담 없는 값이에요']] },
      { name: '1단 건조대 (예시)', bought_at: ago(4), price_band: '2만 원대', shop: '온라인', verdict: 'no', stage: 'month', in_use: 'no', one_line: '받침에 물이 고여 다시 사지 않을 건조대',
        checks: [['세척', 'bad', '받침에 물이 고여 물때가 생겨요'], ['자리', 'good', '폭은 가장 좁아요']] },
    ],
  },
  {
    title: '[예시] 젖병 세척솔, 아직은 첫인상',
    slug: 'bottle-brush',
    category: 'baby', item: '수유', period: '임신 중',
    summary: '출산 전에 미리 사 둔 젖병 세척솔. 아직 써 보기 전이라 손에 쥐어 본 첫인상만 적어요.',
    body: `출산 준비물 목록에서 가장 먼저 산 물건이에요. 아직 젖병을 닦아 보지는 않았고, 컵과 물병으로만 몇 번 써 봤어요.

한 달 넘게 써 본 뒤에 판정을 다시 적을게요.`,
    downside: '- 솔 머리가 커서 입구가 좁은 젖병에는 안 들어갈 수 있어요.',
    products: [
      { name: '회전형 젖병 세척솔 (예시)', bought_at: kstDay(), price_band: '1만 원 미만', shop: '온라인', verdict: 'maybe', stage: 'first', in_use: 'yes', one_line: '손잡이는 편한데 솔 머리가 커요',
        checks: [['세척과 소독', 'good', '솔을 빼서 삶을 수 있어요'], ['무게와 접이', 'good', '가벼워요'], ['쓰는 기간', 'soso', '아직 모르겠어요'], ['값', 'good', '부담 없는 값이에요']] },
    ],
  },
];

const DIARY = {
  title: '[예시] 임신하고 나서 바뀐 주방 동선',
  slug: 'kitchen-route',
  body: `배가 나오기 시작하니 아래 칸 서랍을 여는 게 일이 됐어요. 자주 쓰는 냄비와 그릇을 허리 높이로 올렸어요.

- 냄비 두 개는 가스레인지 옆 선반으로
- 매일 쓰는 그릇은 건조대 위 칸에 그대로
- 아래 칸에는 한 달에 한 번 쓰는 것만

옮기고 나서 허리를 굽히는 일이 하루에 열 번은 줄었어요.`,
};

const LIST = {
  slug: 'birth',
  title: '[예시] 출산 준비물: 산 것, 미룬 것, 안 산 것',
  intro: '출산 전에 준비하면서 적은 목록이에요. 미룬 것은 아이가 태어난 뒤에 필요하면 사려고 남겨 뒀어요.',
  groups: [
    ['수유', ['젖병', '젖병 세척솔', '젖병 소독기', '수유 쿠션']],
    ['목욕', ['아기 욕조', '목욕 타월', '목욕 온도계']],
    ['위생', ['기저귀', '물티슈', '아기 손톱 가위']],
    ['잠', ['속싸개', '아기 이불']],
    ['외출', ['카시트', '유아차', '기저귀 가방']],
    ['옷', ['배냇저고리', '내복', '손싸개·발싸개']],
  ],
};

export async function insertSamples(env) {
  const now = nowIso();
  for (const r of reviews()) {
    const res = await env.DB.prepare(`INSERT INTO posts (type, slug, title, summary, body, downside, category, item, period, acquired, status, created_at, updated_at) VALUES ('review', ?, ?, ?, ?, ?, ?, ?, ?, 'own', 'draft', ?, ?)`)
      .bind(r.slug, r.title, r.summary, r.body, r.downside, r.category, r.item, r.period || '', now, now).run();
    const postId = res.meta.last_row_id;
    for (const [i, x] of r.products.entries()) {
      const pr = await env.DB.prepare(`INSERT INTO products (post_id, sort, name, bought_at, price_band, shop, verdict, stage, one_line, in_use, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(postId, i, x.name, x.bought_at, x.price_band, x.shop, x.verdict, x.stage, x.one_line, x.in_use, now).run();
      const pid = pr.meta.last_row_id;
      const checks = x.checks.length ? x.checks : CHECK_DEFAULTS[r.category].map((l) => [l, '', '']);
      await env.DB.batch(checks.map(([label, mark, note], j) => env.DB.prepare('INSERT INTO checks (product_id, sort, label, mark, note) VALUES (?, ?, ?, ?, ?)').bind(pid, j, label, mark, note)));
    }
  }
  await env.DB.prepare(`INSERT INTO posts (type, slug, title, body, status, created_at, updated_at) VALUES ('diary', ?, ?, ?, 'draft', ?, ?)`)
    .bind(DIARY.slug, DIARY.title, DIARY.body, now, now).run();
  const exists = await env.DB.prepare('SELECT id FROM lists WHERE slug = ?').bind(LIST.slug).first();
  const lr = await env.DB.prepare(`INSERT INTO lists (slug, title, intro, status, sort, updated_at) VALUES (?, ?, ?, 'draft', 0, ?)`)
    .bind(exists ? '' : LIST.slug, LIST.title, LIST.intro, now).run();
  const listId = lr.meta.last_row_id;
  const stmts = [];
  let sort = 0;
  for (const [grp, names] of LIST.groups) {
    for (const name of names) stmts.push(env.DB.prepare(`INSERT INTO list_items (list_id, sort, grp, name, state, note, post_id) VALUES (?, ?, ?, ?, 'choosing', '', 0)`).bind(listId, sort++, grp, name));
  }
  await env.DB.batch(stmts);
}
