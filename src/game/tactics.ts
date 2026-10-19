/**
 * Plain-language tactic guide (Julius 2026-10-19: 작전 설명을 더 친절하게, 목적타·페이크를 명확히).
 * One place for the tactics screen, the timeout sheet and the matchup chart.
 */
import type { Tactic } from '../engine/types.ts';

export interface OptionInfo {
  name: string;
  /** what the players actually do */
  what: string;
  /** when it pays off */
  good: string;
  /** what beats it */
  weak: string;
}

export interface AxisInfo {
  key: keyof Tactic;
  name: string;
  intro: string;
  opts: Record<string, OptionInfo>;
  /** shown only when this returns true (목적타 구역 needs serve = 목적타) */
  when?: (t: Tactic) => boolean;
}

export const TACTIC_INFO: AxisInfo[] = [
  {
    key: 'distribution', name: '공격 배분',
    intro: '세터가 누구에게 공을 많이 올릴지 정합니다. 잘 때리는 선수에게 몰면 강하지만, 상대가 그 선수만 막으면 막혀요.',
    opts: {
      balanced: { name: '고른 배분', what: '레프트·라이트·센터에게 골고루 올립니다.', good: '상대가 에이스 마크로 한 명만 막을 때', weak: '확실한 에이스가 있는데 안 쓰는 셈이라 화력이 약간 낮아요' },
      left: { name: '레프트 중심', what: '레프트 두 명에게 많이 올립니다.', good: '레프트가 팀에서 가장 잘 때릴 때', weak: '에이스 마크 블로킹, 공격수 겨냥 목적타' },
      right: { name: '라이트 집중', what: '라이트(아포짓) 한 명에게 몰아줍니다. 리시브를 안 해서 공격에만 집중해요.', good: '라이트가 팀 최고의 공격수일 때', weak: '에이스 마크 블로킹' },
      middle: { name: '중앙 활용', what: '센터의 속공을 자주 씁니다.', good: '센터의 속공 능력이 좋고 리시브가 안정적일 때', weak: '예측 블로킹, 짧은 서브' },
    },
  },
  {
    key: 'tempo', name: '공격 템포',
    intro: '토스를 높게 올릴지 빠르게 쏠지 정합니다. 빠른 공은 블로커가 붙기 전에 때리지만 리시브가 정확해야 해요.',
    opts: {
      high: { name: '높은 공', what: '높게 올려 공격수가 충분히 도움닫기를 하고 때립니다.', good: '리시브가 흔들릴 때, 공격수 높이가 좋을 때', weak: '따라가기 블로킹이 높은 공을 잘 잡아요' },
      fast: { name: '빠른 공', what: '낮고 빠른 토스로 블로커가 모이기 전에 때립니다.', good: '리시브가 안정적일 때, 상대가 따라가기 블로킹일 때', weak: '리시브가 흔들리면 범실이 늘어요. 짧은 서브에 약해요' },
    },
  },
  {
    key: 'serve', name: '서브',
    intro: '서브로 상대 리시브를 흔들면 상대 공격이 단순해져 블로킹으로 잡기 쉬워집니다. 세게 칠수록 범실도 늘어요.',
    opts: {
      power: { name: '강서브', what: '점프 서브로 세게 때립니다. 에이스도 범실도 많아요.', good: '상대가 2인 리시브일 때, 우리 서브 능력이 좋을 때', weak: '3인 리시브. 서브가 약하면 범실만 늘어요' },
      target: { name: '목적타', what: '정한 구역(아래에서 고름)을 노려 넣습니다.', good: '상대 리시브에 약점이 보일 때', weak: '노린 구역에 따라 다름' },
      safe: { name: '안전 서브', what: '범실 없이 넣는 데만 집중합니다.', good: '접전 막판, 우리 서브가 약할 때', weak: '상대 리시브가 편해져 공격을 다 쓸 수 있어요' },
    },
  },
  {
    key: 'aim', name: '목적타 구역', when: t => t.serve === 'target',
    intro: '목적타로 어디를 노릴지 고릅니다. 서브 능력이 좋을수록 원하는 곳에 정확히 들어가요.',
    opts: {
      weak: { name: '약한 리시버', what: '리시브가 가장 약한 선수에게 서브를 모읍니다.', good: '상대에 리시브가 약한 선수가 있을 때, 상대가 2인 리시브일 때', weak: '3인 리시브, 리시브가 고른 팀' },
      hitter: { name: '공격수 겨냥', what: '리시브도 하는 상대 레프트(주공격수)에게 넣어 공격 준비를 늦춥니다.', good: '상대가 레프트 중심 공격일 때', weak: '라이트 집중·중앙 활용 팀은 레프트를 안 써서 효과가 없어요' },
      seam: { name: '리시버 사이 틈', what: '두 리시버 사이로 넣어 서로 미루게 만듭니다. 조금 더 어려운 서브라 범실이 약간 늘어요.', good: '상대가 2인 리시브일 때', weak: '3인 리시브는 틈이 좁아요' },
      short: { name: '짧은 서브', what: '네트 바로 앞에 짧게 떨어뜨려 앞줄 선수가 받게 합니다.', good: '상대가 중앙 속공이나 빠른 공을 쓸 때 (센터가 공을 받느라 속공을 못 뛰어요)', weak: '서브 압박 자체는 약해요. 고른 배분·높은 공 팀에겐 손해' },
    },
  },
  {
    key: 'block', name: '블로킹',
    intro: '블로커가 언제, 누구를 따라 뛸지 정합니다. 맞히면 블로킹 득점이 쏟아지고, 틀리면 빈 곳이 뚫려요.',
    opts: {
      read: { name: '따라가기', what: '토스를 보고 나서 따라가 뜁니다. 가장 무난해요.', good: '높은 공, 속공 페이크를 쓰는 팀', weak: '빠른 공에 한 박자 늦어요' },
      commit: { name: '예측', what: '센터 속공 타이밍에 미리 뜁니다.', good: '중앙 활용 팀', weak: '날개 공격, 속공 페이크에 잘 속아요' },
      aceMark: { name: '에이스 마크', what: '상대 에이스 한 명에게 블로커를 붙입니다.', good: '라이트 집중·레프트 중심 팀', weak: '고른 배분 팀, 속공 페이크' },
    },
  },
  {
    key: 'defense', name: '수비',
    intro: '수비수가 어디에 설지 정합니다. 강타를 받으려면 뒤로, 페인트(연타)를 받으려면 앞으로 서야 해요.',
    opts: {
      deep: { name: '강타 대비', what: '코트 뒤쪽에 깊게 서서 강한 스파이크를 받습니다.', good: '파워 공격 팀', weak: '연타·세터 투 어택이 앞에 떨어져요' },
      tip: { name: '연타 대비', what: '앞으로 당겨 서서 페인트와 투 어택을 받습니다.', good: '기교파 공격, 세터 투 어택을 쓰는 팀', weak: '강한 스파이크가 뒤로 빠져요' },
    },
  },
  {
    key: 'reception', name: '리시브 인원',
    intro: '서브를 몇 명이 받을지 정합니다.',
    opts: {
      3: { name: '3인', what: '리베로와 레프트 두 명이 함께 받습니다.', good: '상대가 강서브·목적타로 흔들 때', weak: '레프트가 리시브 후 공격 준비가 늦어요' },
      2: { name: '2인', what: '리베로와 레프트 한 명만 받고 나머지는 공격 준비에 집중합니다.', good: '상대 서브가 약할 때', weak: '강서브, 리시버 사이 틈 목적타' },
    },
  },
  {
    key: 'trick', name: '세트 플레이',
    intro: '블로커와 수비를 속이는 약속된 플레이입니다. 세터와 센터 능력이 좋을수록 잘 통하고, 상대가 노련하면 읽혀요.',
    opts: {
      none: { name: '정공법', what: '속임수 없이 정상적으로 공격합니다.', good: '전력이 앞설 때, 상대가 읽기 수비를 할 때', weak: '-' },
      decoy: { name: '속공 페이크', what: '센터가 속공처럼 먼저 뛰어 블로커를 끌고, 공은 날개로 올립니다(시간차). 센터가 미끼라 실제 속공은 줄어요.', good: '예측 블로킹·에이스 마크 팀', weak: '따라가기 블로킹은 잘 안 속아요. 리시브가 흔들리면 못 써요' },
      dump: { name: '세터 투 어택', what: '세터가 전위일 때 가끔 두 번째 공을 토스하는 척 상대 코트에 살짝 넘깁니다(패스 페인트).', good: '강타 대비 수비 팀 (앞이 비어요)', weak: '연타 대비 수비. 읽히면 상대에게 찬스볼이 돼요' },
    },
  },
];

export const axisInfo = (k: keyof Tactic) => TACTIC_INFO.find(a => a.key === k)!;
export const optName = (k: keyof Tactic, v: unknown) => axisInfo(k).opts[String(v)]?.name ?? String(v);

/** Matchup chart rows: [our tactic, works well against, struggles against] */
export const MATCHUPS: [string, string, string][] = [
  ['강서브', '2인 리시브', '3인 리시브 · 우리 서브가 약할 때'],
  ['목적타 · 약한 리시버', '리시브 약한 선수가 있는 팀', '3인 리시브'],
  ['목적타 · 공격수 겨냥', '레프트 중심 공격', '라이트 집중 · 중앙 활용'],
  ['목적타 · 리시버 사이 틈', '2인 리시브', '3인 리시브'],
  ['목적타 · 짧은 서브', '중앙 활용 · 빠른 공', '고른 배분 + 높은 공'],
  ['빠른 공', '따라가기 블로킹', '리시브가 흔들릴 때 · 짧은 서브'],
  ['예측 블로킹', '중앙 활용', '날개 공격 · 속공 페이크'],
  ['에이스 마크', '라이트 집중 · 레프트 중심', '고른 배분 · 속공 페이크'],
  ['속공 페이크', '예측 블로킹 · 에이스 마크', '따라가기 블로킹'],
  ['세터 투 어택', '강타 대비 수비', '연타 대비 수비'],
  ['연타 대비 수비', '세터 투 어택 · 기교파', '파워 공격'],
  ['3인 리시브', '강서브 · 목적타', '(레프트 공격이 조금 늦어짐)'],
];
