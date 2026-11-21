// 화면과 관리 화면에서 함께 쓰는 이름표
// 기획서 3.0의 분류, 판정, 써 본 기간, 깐깐 체크 기본 항목을 그대로 옮겼어요.

export const CATS = { kitchen: '주방', living: '생활', baby: '육아' };

export const ITEMS = {
  kitchen: ['조리 도구', '보관 용기', '세척 도구', '소형 가전', '식기'],
  living: ['청소', '세탁', '수납', '욕실'],
  baby: ['임신·출산 준비', '수유', '목욕', '위생', '수면', '외출', '이유식'],
};

export const PERIODS = ['임신 중', '0~3개월', '4~6개월', '7~12개월'];

export const VERDICTS = { buy: '다시 산다', maybe: '고민 중', no: '안 산다' };
export const STAGES = { first: '첫인상', month: '한 달 뒤', six: '여섯 달 뒤' };
export const IN_USE = { yes: '쓰는 중', sometimes: '가끔 씀', no: '안 씀' };
export const MARKS = { good: '○', soso: '△', bad: '✕' };
export const MARK_WORDS = { good: '좋음', soso: '보통', bad: '아쉬움' };
export const POINTS = { month: '한 달 뒤', six: '여섯 달 뒤', other: '덧붙임' };

export const CHECK_DEFAULTS = {
  kitchen: ['세척', '소재와 코팅', '무게와 손잡이', '자리', '내구', '값'],
  living: ['성능', '소음', '관리와 세척', '자리', '소모품 값', '값'],
  baby: ['세척과 소독', '무게와 접이', '표시 확인', '쓰는 기간', '아이 반응', '값'],
};

export const PRICE_BANDS = ['1만 원 미만', '1만 원대', '2만 원대', '3만 원대', '4만 원대', '5~10만 원', '10~20만 원', '20~50만 원', '50만 원 이상'];

export const LIST_STATES = { bought: '산 것', later: '미룬 것', skip: '안 산 것', choosing: '고르는 중' };

export const COUPANG_SENTENCE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
export const GIFT_SENTENCE = '업체에서 물건을 제공받아 써 보고 씁니다.';
export const OWN_SENTENCE = '제 돈으로 사서 써 보고 씁니다.';

export const PRINCIPLES = [
  ['써 본 것만 씁니다.', `아직 써 보지 않은 물건은 '살까 고민 중'으로 따로 적습니다.`],
  ['충분히 써 본 뒤 판정합니다.', `산 지 얼마 안 된 글에는 '첫인상'이라고 표시하고, 첫인상 글에는 '다시 산다'를 달지 않습니다.`],
  ['아쉬운 점과 안 산 이유도 씁니다.', '아쉬운 점이 없는 후기는 올리지 않습니다.'],
  ['한 달 뒤, 여섯 달 뒤 다시 씁니다.', '판정이 바뀌면 바뀐 대로 고칩니다.'],
  ['대가 관계를 글머리에서 먼저 밝힙니다.', '내 돈으로 샀는지, 제공받았는지, 구매 링크에 수수료가 붙는지를 적습니다.'],
];

export const label = (map, key, fallback = '') => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : fallback);
