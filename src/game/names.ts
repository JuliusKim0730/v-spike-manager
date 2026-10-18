/** Fictional clubs and Korean player names (GDD 1: 가상의 24개 구단) */
import type { Rng } from '../engine/rng.ts';

export const CLUBS: { name: string; short: string; color: string }[] = [
  // 1부
  { name: '수원 오로라', short: '오로라', color: '#7c5cff' },
  { name: '인천 블루웨이브', short: '블루웨이브', color: '#1e6fe8' },
  { name: '서울 스카이퀸즈', short: '스카이퀸즈', color: '#0aa5c9' },
  { name: '대전 레드윙스', short: '레드윙스', color: '#e2384d' },
  { name: '광주 선플라워즈', short: '선플라워즈', color: '#f2a516' },
  { name: '화성 파이어버즈', short: '파이어버즈', color: '#f05a28' },
  { name: '김천 그린팬서스', short: '그린팬서스', color: '#1f9d55' },
  { name: '천안 실버폭스', short: '실버폭스', color: '#7a8699' },
  // 2부
  { name: '부산 씨걸스', short: '씨걸스', color: '#2b8ac6' },
  { name: '대구 썬더볼츠', short: '썬더볼츠', color: '#d9a400' },
  { name: '청주 체리블라썸', short: '체리블라썸', color: '#e0559b' },
  { name: '전주 하모니', short: '하모니', color: '#8a5cd6' },
  { name: '창원 돌핀스', short: '돌핀스', color: '#18a3a3' },
  { name: '포항 스틸레이디스', short: '스틸레이디스', color: '#4b5563' },
  { name: '원주 스노우캣츠', short: '스노우캣츠', color: '#5b8def' },
  { name: '제주 오렌지윙스', short: '오렌지윙스', color: '#f08c00' },
  // 3부
  { name: '춘천 레이크스', short: '레이크스', color: '#2f7fb8' },
  { name: '강릉 썬라이즈', short: '썬라이즈', color: '#ef6c3a' },
  { name: '목포 마린스', short: '마린스', color: '#1866a8' },
  { name: '여수 나이트블루', short: '나이트블루', color: '#3949ab' },
  { name: '안동 피닉스', short: '피닉스', color: '#c2410c' },
  { name: '군산 웨이브즈', short: '웨이브즈', color: '#0284c7' },
  { name: '순천 그린리프', short: '그린리프', color: '#16a34a' },
  { name: '속초 시호크스', short: '시호크스', color: '#475569' },
];

const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전', '홍', '고', '문', '양', '손', '배', '백', '허', '남', '심', '노', '하', '곽', '성', '차', '주', '우', '구', '민', '진', '나', '지', '채', '원', '천', '방', '현', '변', '염', '도'];
const SUR_W = SURNAMES.map((_, i) => (i < 5 ? 12 - i * 1.5 : i < 15 ? 3 : 1));
const FIRST = ['서', '지', '민', '하', '수', '예', '유', '채', '다', '은', '소', '윤', '가', '나', '혜', '세', '아', '주', '시', '도', '연', '효', '보', '초', '규', '태', '정', '희', '미', '선'];
const SECOND = ['연', '은', '윤', '린', '아', '진', '희', '원', '영', '빈', '서', '현', '정', '인', '율', '담', '솜', '나', '리', '우', '온', '별', '결', '주', '경', '지', '민', '비'];
const FOREIGN = [['마리아', 'BRA'], ['안나', 'SRB'], ['카밀라', 'ITA'], ['소피아', 'USA'], ['엘레나', 'RUS'], ['이사벨라', 'DOM'], ['나탈리아', 'POL'], ['율리아', 'UKR'], ['다니엘라', 'PUR'], ['레베카', 'NED'], ['카타리나', 'CRO'], ['조던', 'USA'], ['멜리사', 'TUR'], ['밀레나', 'BUL'], ['클라라', 'BEL'], ['아드리아나', 'COL'], ['가브리엘라', 'ARG'], ['로레나', 'CUB'], ['한나', 'GER'], ['에바', 'SVK']];

export function koreanName(rng: Rng): string {
  let given = '';
  do given = FIRST[rng.int(0, FIRST.length - 1)] + SECOND[rng.int(0, SECOND.length - 1)];
  while (given[0] === given[1] || given === '연경');
  return rng.pickWeighted(SURNAMES, SUR_W) + given;
}

export function foreignName(rng: Rng): string {
  const [n, c] = FOREIGN[rng.int(0, FOREIGN.length - 1)];
  return `${n} (${c})`;
}
