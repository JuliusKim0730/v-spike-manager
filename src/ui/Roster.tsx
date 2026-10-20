import { useState } from 'react';
import { isFirstTeam, moveSquad, ovr, releasePlayer, scoutLevel, userClub, userTeam, clubColor } from '../game/career.ts';
import { bestGrade, categoryMult, effectiveLevel, headCoach } from '../engine/league/staff.ts';
import type { Pro } from '../engine/league/types.ts';
import type { Position, TechKey } from '../engine/types.ts';
import { physScore, techScore, TECH_SET, PHYS_KEYS, TECH_KEYS } from '../engine/player.ts';
import { salaryBreakdown } from '../engine/league/contract.ts';
import type { TrainMode } from '../engine/league/growth.ts';
import { clubGrowthMult, playMult } from '../engine/league/season.ts';
import { RULES } from '../engine/league/rules.ts';
import { SKILL_BY_ID, skillSlots } from '../engine/skills.ts';
import { STAT_KO } from '../game/report.ts';
import { Gauges, Grade, Overlay, Ovr, Pos, POS_KO, useGame } from './common.tsx';
import { Avatar } from './art.tsx';

const gradeTxt = (g: string) => (g === 'none' ? '없음' : `${g}급`);

const ORDER: Position[] = ['S', 'OH', 'OP', 'MB', 'L'];

export function Roster() {
  const { c, openPlayer } = useGame();
  const club = userClub(c);
  const [squad, setSquad] = useState<'all' | 1 | 2>('all');
  const [filter, setFilter] = useState<'all' | Position>('all');
  const starters = new Set(userTeam(c).starters.map(p => p.id));
  const list = [...club.roster]
    .filter(p => (filter === 'all' || p.position === filter) && (squad === 'all' || (squad === 1) === isFirstTeam(club, p)))
    .sort((a, b) => Number(isFirstTeam(club, b)) - Number(isFirstTeam(club, a)) || ORDER.indexOf(a.position) - ORDER.indexOf(b.position) || ovr(b) - ovr(a));
  const payroll = club.roster.reduce((a, p) => a + p.salary, 0);
  const foreign = club.roster.filter(p => p.foreign).length;
  return (
    <>
      <div className="row between">
        <span className="small muted">총 {club.roster.length}명 · 용병 {foreign} · 연봉 <b className="c-blue">{payroll.toFixed(1)}억</b></span>
        <div className="seg" style={{ width: 150 }}>{(['all', 1, 2] as const).map(k => <button key={k} aria-pressed={squad === k} onClick={() => setSquad(k)}>{k === 'all' ? '전체' : `${k}군`}</button>)}</div>
      </div>
      <div className="seg light">{(['all', ...ORDER] as const).map(p => <button key={p} aria-pressed={filter === p} onClick={() => setFilter(p)}>{p === 'all' ? '전체' : POS_KO[p]}</button>)}</div>
      <section className="card flush">
        <div className="rtable">
          <div className="rrow head"><span>포지션</span><span>이름 · 나이</span><span className="r">능력</span><span className="r">잠재</span><span className="r">계약</span><span className="r">연봉</span></div>
          {list.map(p => (
            <button key={p.id} className={`rrow ${isFirstTeam(club, p) ? 'first' : 'second'}`} onClick={() => openPlayer(p)}>
              <span className="row" style={{ gap: 4 }}><span className="dot" style={{ background: isFirstTeam(club, p) ? 'var(--green)' : 'var(--orange)' }} /><Pos p={p.position} /></span>
              <span className="nm" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                <b style={{ maxWidth: '100%' }}>{p.name} <span className="tiny muted" style={{ fontWeight: 400 }}>{p.age}세</span></b>
                <span className="row" style={{ gap: 3 }}>
                  {starters.has(p.id) && <span className="tag blue">선발</span>}
                  {p.foreign && <span className="tag purple">용병</span>}
                  {p.injured > 0 && <span className="tag bad">부상</span>}
                  {p.train && p.train !== 'integrated' && <span className="tag good">{p.train === 'physical' ? '신체' : p.train === 'skill' ? '기술' : '집중'}</span>}
                </span>
              </span>
              <span className="r"><Ovr v={ovr(p)} /></span>
              <span className="r"><Grade v={(p.potPhys + p.potTech) / 2} /></span>
              <span className="r">{p.contract}</span>
              <span className="r">{p.salary.toFixed(1)}억</span>
            </button>
          ))}
        </div>
      </section>
      <p className="tiny muted" style={{ margin: 0 }}>초록 = 1군(경기 출전, 14명), 주황 = 2군(성장 55%). 선수를 눌러 1군·2군 이동, 훈련 방식, 방출을 정합니다.</p>
    </>
  );
}

const GROWTH_KO = { early: '조기 성장형', normal: '평균형', late: '만기형', elite: '엘리트' };

export function PlayerSheet({ p, onClose }: { p: Pro; onClose(): void }) {
  const { c, refresh, toast, setTab } = useGame();
  const [confirm, setConfirm] = useState(false);
  const mine = p.clubId === c.userId;
  const keys = TECH_SET[p.position];
  const sb = salaryBreakdown(p);
  // free agents are read by the scout center, other clubs' players by the analysis room
  const fa = p.clubId < 0;
  const hidden = !mine && (fa ? scoutLevel(c) < 2 : effectiveLevel(userClub(c), 'analysis') < 3);
  const showPot = mine || (fa && scoutLevel(c) >= 4);
  const stat = (k: string, v: number, key: boolean) => (
    <div key={k} className="statrow"><span>{STAT_KO[k]}</span><div className={`bar ${key ? 'key' : ''}`}><i style={{ width: `${Math.min(100, v)}%` }} /></div><span className="num" style={{ textAlign: 'right', fontSize: 15 }}>{hidden ? '?' : Math.round(v)}</span></div>
  );
  return (
    <Overlay title={p.name} onClose={onClose}>
      <section className="card">
        <div className="row" style={{ gap: 12 }}>
          <span className="ava" style={{ width: 64, height: 64, borderRadius: 16 }}><Avatar id={p.id} color={clubColor(p.clubId >= 0 ? p.clubId : 0)} foreign={p.foreign} size={64} /></span>
          <div className="grow"><div className="row" style={{ gap: 6 }}><Pos p={p.position} /><b>{POS_KO[p.position]}</b></div><div className="small muted">{p.age}세 · {p.height}cm</div></div>
          <div style={{ textAlign: 'center' }}><div className="tiny muted">능력</div><Ovr v={ovr(p)} big /></div>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="tag">신체 {physScore(p)}</span><span className="tag">기술 {techScore(p)}</span>
          {showPot && <span className="tag blue">잠재 {p.potGrade} · {GROWTH_KO[p.growth]}</span>}
          {p.injured > 0 && <span className="tag bad">부상 {p.injured}경기</span>}
          <Gauges p={p} />
        </div>
      </section>
      <section className="card">
        <h3>신체</h3>
        {PHYS_KEYS.map(k => stat(k, p.phys[k], false))}
        <h3>기술 <span className="tiny muted">노란 막대 = {POS_KO[p.position]} 기술 4개 (OVR 반영)</span></h3>
        {[...keys, ...TECH_KEYS.filter(k => !keys.includes(k))].map(k => stat(k, p.tech[k], keys.includes(k)))}
        {hidden && <p className="tiny muted" style={{ margin: 0 }}>{fa ? '스카우트센터 효과 2단계부터 FA 선수의 개별 능력치가 보입니다.' : '전력분석실 효과 3단계부터 다른 팀 선수의 개별 능력치가 보입니다.'}</p>}
      </section>
      {mine && !p.foreign && <TrainPicker p={p} />}
      <section className="card">
        <h3>스킬 {p.skills.length}/{skillSlots(ovr(p))}</h3>
        <div className="row wrap" style={{ gap: 6 }}>
          {p.skills.length ? p.skills.map(id => { const s = SKILL_BY_ID.get(id); return s && <span key={id} className={`tag ${s.grade === 'S' || s.grade === 'A' ? 'blue' : ''}`}>{s.grade} {s.name}</span>; }) : <span className="small muted">보유 스킬 없음</span>}
        </div>
      </section>
      <section className="card">
        <h3>계약</h3>
        <div className="small">{mine ? `연봉 ${p.salary.toFixed(2)}억 · 남은 계약 ${p.contract}시즌` : `요구 연봉 ${sb.ask.toFixed(2)}억`}</div>
        <div className="tiny muted">요구 연봉 = OVR 기준 {sb.base.toFixed(2)}억 × 나이 {sb.age} × 능력치 총합 {sb.total.toFixed(2)} × 스킬 {sb.skills.toFixed(2)} × 잠재 {sb.potential.toFixed(2)} = <b>{sb.ask.toFixed(2)}억</b></div>
        {mine && !confirm && (
          <div className="grid2">
            <button className="btn" onClick={() => { const m = moveSquad(c, p); if (m) toast(m); refresh(); }}>{isFirstTeam(userClub(c), p) ? '2군으로 이동' : '1군으로 이동'}</button>
            <button className="btn danger" onClick={() => setConfirm(true)}>방출</button>
          </div>
        )}
        {mine && confirm && (
          <div className="confirm">
            {p.name} 선수를 방출하면 FA 시장으로 갑니다. 다른 팀이 데려갈 수 있어요.
            <div className="row">
              <button className="btn sm danger" onClick={() => { const err = releasePlayer(c, p); if (err) toast(err); else { toast(`${p.name} 방출`); refresh(); onClose(); setTab('roster'); } setConfirm(false); }}>방출 확정</button>
              <button className="btn sm" onClick={() => setConfirm(false)}>취소</button>
            </div>
          </div>
        )}
      </section>
    </Overlay>
  );
}

const PLANS: [string, string, string][] = [
  ['integrated', '통합', '신체 4 + 기술 4에 고르게 · 각 ×1'],
  ['physical', '신체만', '신체 4개 · 각 ×2'],
  ['skill', '기술만', '포지션 기술 4개 · 각 ×2'],
  ['focus', '집중', '능력치 1개 · ×8, 같은 분류 최저치의 1.5배를 넘으면 느려짐'],
];

function TrainPicker({ p }: { p: Pro }) {
  const { refresh, c } = useGame();
  const club = userClub(c);
  const env = clubGrowthMult(club), play = playMult(club, p);
  const head = headCoach(club), cat = categoryMult(club);
  const playTxt = p.injured > 0 ? '부상' : club.roster.indexOf(p) >= 14 ? '2군' : play >= 1 ? '주전' : play >= 0.85 ? '로테이션' : '벤치';
  const plan = p.train ?? 'integrated';
  const kind = typeof plan === 'object' ? 'focus' : plan;
  const focusKey = typeof plan === 'object' ? plan.focus : TECH_SET[p.position][0];
  const set = (t: TrainMode) => { p.train = t; refresh(); };
  return (
    <section className="card">
      <div className="row between"><h3>훈련 방식</h3><span className="tag purple">성장 속도 {Math.round(env * play * 100)}%</span></div>
      <span className="tiny muted">최고 조건(1군 주전 · 훈련시설 5단계 · S급 코치진) = 100%. 지금: 시설 {Math.round(RULES.trainingMult[club.facilities.training] * 100)}% × 수석코치 {gradeTxt(head)} {Math.round(RULES.coachMult[head] * 100)}% × 출전({playTxt}) {Math.round(play * 100)}% · 신체 능력치 ×{cat.phys.toFixed(2)} (신체코치 {gradeTxt(bestGrade(club, 'physical'))}) · 기술 능력치 ×{cat.tech.toFixed(2)} (기술코치 {gradeTxt(bestGrade(club, 'technical'))})</span>
      <div className="seg">
        {PLANS.map(([k, n]) => <button key={k} aria-pressed={kind === k} onClick={() => set((k === 'focus' ? { focus: focusKey } : k) as TrainMode)}>{n}</button>)}
      </div>
      {kind === 'focus' && (
        <select id="focus-stat" value={focusKey} onChange={e => set({ focus: e.target.value as TechKey })}
          className="sel">
          {[...PHYS_KEYS, ...TECH_SET[p.position]].map(k => <option key={k} value={k}>{STAT_KO[k]} ({Math.round((p.phys as Record<string, number>)[k] ?? (p.tech as Record<string, number>)[k])})</option>)}
        </select>
      )}
      <span className="tiny muted">{PLANS.find(x => x[0] === kind)![2]}. 같은 성장 포인트를 몇 개 능력치에 나누느냐의 차이라 OVR이 오르는 속도는 거의 같습니다. 잠재력 상한에 닿으면 남는 포인트는 다른 능력치로 갑니다.</span>
    </section>
  );
}
