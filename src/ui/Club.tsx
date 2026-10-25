import { useState } from 'react';
import {
  canTrade, DIV_NAME, FACILITY_EFFECT, FACILITY_NAME, finance, MAX_ROSTER, ovr, signFA, upgrade, upgradeCost, userClub,
} from '../game/career.ts';
import { askingSalary } from '../engine/league/contract.ts';
import type { Facility, Staff } from '../engine/league/types.ts';
import { effectiveLevel, rolesOf, STAFF_ROLES, staffOf } from '../engine/league/staff.ts';
import { fireStaff, hireStaff, severanceOf } from '../game/staff.ts';
import type { Position } from '../engine/types.ts';
import { Grade, Icon, money, Overlay, Ovr, Pos, POS_KO, Sheet, Stars, useGame } from './common.tsx';
import { FacilityArt } from './art.tsx';
import { CreditsBody } from './Credits.tsx';
import { OptionsCard } from './Assist.tsx';

const FAC: Facility[] = ['training', 'medical', 'restaurant', 'stadium', 'analysis', 'scout', 'bus'];

const STAR_TXT = ['미건설', '기본', '보통', '좋음', '훌륭', '완벽'];

export function Club() {
  const { c, quit } = useGame();
  const club = userClub(c);
  const f = finance(c);
  const [fac, setFac] = useState<Facility | null>(null);
  const [credits, setCredits] = useState(false);
  return (
    <>
      <div className="grid2">
        {FAC.map(k => {
          const lvl = club.facilities[k];
          return (
            <button key={k} className="fac" onClick={() => setFac(k)}>
              <span className="art"><FacilityArt k={k} level={lvl} /></span>
              <b>{FACILITY_NAME[k]}</b>
              {rolesOf(k).length > 0 && <span className="tiny muted">스태프 {club.staff?.filter(s => STAFF_ROLES[s.role].facility === k).length ?? 0}/3{k === 'scout' ? ' · 이적 업무' : ''}</span>}
              <span className="row between"><span className="tiny" style={{ color: 'var(--red)', fontWeight: 700 }}>{STAR_TXT[lvl]}</span><Stars n={lvl} /></span>
            </button>
          );
        })}
      </div>
      <button className="menu-row" onClick={() => setFac('scout')}>
        <span className="ico">🔎</span>
        <span className="grow"><b>이적 업무 · 스카우트센터</b> {canTrade(c) && <span className="tag good">영입 가능</span>}<div className="tiny muted">FA 시장 · 드래프트 · 용병 계약 · 재계약</div></span>
        <span className="chev"><Icon name="chev" /></span>
      </button>
      <section className="card">
        <h2>재정</h2>
        <div className="list small">
          <Line k="구단 기본 예산" v={money(f.base)} />
          <Line k="스폰서 수입 (지난 순위 반영)" v={money(f.sponsor)} />
          <Line k="선수 연봉" v={`−${money(f.pay)}`} />
          <Line k={`스태프 연봉 (${club.staff?.length ?? 0}명)`} v={`−${money(f.staff)}`} />
          <Line k="원정·운영비" v={`−${money(f.ops)}`} />
          <Line k="시설 유지비 · 전지훈련" v={`−${money(f.maint + f.camp)}`} />
          <Line k="예상 손익 (관중·굿즈·상금 제외)" v={money(f.projected)} strong tone={f.projected >= 0 ? 'green' : 'red'} />
          <Line k="현재 자금" v={money(f.cash)} strong tone="blue" />
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>손익은 시즌 결산 때 자금에 더해집니다. 3년 연속 적자면 해임됩니다.</p>
      </section>
      <section className="card">
        <div className="row between"><h2>신임도</h2><b className="num" style={{ fontSize: 22 }}>{c.trust}</b></div>
        <div className="bar"><i style={{ width: `${c.trust}%`, background: c.trust < 30 ? 'var(--red)' : 'var(--blue)' }} /></div>
        <div className="small">{c.sponsor ? `${c.sponsor.kind === 'parent' ? '모기업' : '네이밍 스폰서'} 목표: 정규리그 ${c.sponsor.goalRank}위 이내` : '스폰서 계약 턴에 시즌 목표가 정해집니다.'}</div>
        {club.deficitStreak > 0 && <span className="tag bad">연속 적자 {club.deficitStreak}년</span>}
      </section>
      {c.seasons.length > 0 && (
        <section className="card">
          <h2>구단 역사</h2>
          <div className="list small">{c.seasons.map(s => <Line key={s.year} k={`${s.year}시즌 · ${DIV_NAME[s.division]}`} v={`${s.finish} · ${s.balance >= 0 ? '흑자' : '적자'}`} />)}</div>
        </section>
      )}
      <OptionsCard />
      <button className="btn block" onClick={() => setCredits(true)}>만든이 · Contact</button>
      <button className="btn block" onClick={quit}>저장하고 타이틀로</button>
      {credits && <Sheet title="만든이 · Contact" onClose={() => setCredits(false)}><CreditsBody /></Sheet>}
      {fac && <FacilitySheet k={fac} onClose={() => setFac(null)} />}
    </>
  );
}

/** transfer menus live in the scout center (Julius 2026-10-20) */
function TransferMenu({ onClose }: { onClose(): void }) {
  const { c, openMarket, toast, setTab } = useGame();
  const k = c.phase.k;
  const go = () => { onClose(); setTab('home'); };
  const MENU: [string, string, string, string | null, () => void][] = [
    ['🛒', 'FA 시장', 'FA 선수 영입 · 남는 선수 방출', canTrade(c) ? '영입 가능' : null, () => { onClose(); openMarket(); }],
    ['🎓', '드래프트', '신인 선수 지명', k === 'draft' ? '진행 중' : null, () => (k === 'draft' ? go() : toast('시즌이 끝난 뒤 드래프트 턴에 진행합니다'))],
    ['✈️', '용병 계약', '외국인 아포짓 트라이아웃 · 1년 계약', k === 'foreign' ? '진행 중' : null, () => (k === 'foreign' ? go() : toast('시즌이 끝난 뒤 트라이아웃 턴에 진행합니다'))],
    ['✍️', '재계약', '계약 끝난 선수와 협상', k === 'resign' ? '진행 중' : null, () => (k === 'resign' ? go() : toast('시즌이 끝난 뒤 내부 FA 턴에 진행합니다'))],
  ];
  return (
    <div className="stack">
      <h3 style={{ margin: 0 }}>이적 업무</h3>
      {MENU.map(([ico, t, d, tag, fn]) => (
        <button key={t} className="menu-row" onClick={fn}>
          <span className="ico">{ico}</span>
          <span className="grow"><b>{t}</b> {tag && <span className="tag good">{tag}</span>}<div className="tiny muted">{d}</div></span>
          <span className="chev"><Icon name="chev" /></span>
        </button>
      ))}
    </div>
  );
}

const STAFF_EFFECT: Partial<Record<Facility, string>> = {
  training: '수석코치 = 성장 배율과 자동 진행 작전 (B 이상이면 상대 작전을 읽음) · 신체코치 = 신체 능력치 성장 · 기술코치 = 기술 능력치 성장',
  scout: '스카우터가 없으면 효과 절반 · S 1명, A 2명, B 3명이면 1단계 위 정보까지 보입니다',
  stadium: '관리자 = 시설 유지비 절감 · 매니저 = 관중·굿즈 수입 증가',
  medical: '가장 좋은 팀닥터 등급으로 부상률·부상 기간 감소, 추가 닥터마다 +3%',
  analysis: '분석관이 없으면 효과 절반 · S 1명, A 2명, B 3명이면 상대 작전 1축 더 공개',
};

function StaffSection({ k }: { k: Facility }) {
  const { c, refresh, toast } = useGame();
  const club = userClub(c);
  const [hiring, setHiring] = useState<string | null>(null);
  const [firing, setFiring] = useState<Staff | null>(null);
  const roles = rolesOf(k);
  if (!roles.length) return null;
  const count = club.staff?.filter(s => STAFF_ROLES[s.role].facility === k).length ?? 0;
  return (
    <section className="stack" style={{ gap: 8 }}>
      <div className="row between"><h3 style={{ margin: 0 }}>스태프</h3><span className="tiny muted">{count}/3명</span></div>
      <span className="tiny muted">{STAFF_EFFECT[k]}</span>
      {(k === 'analysis' || k === 'scout') && <span className="small c-blue">현재 효과 {effectiveLevel(club, k)}단계 (시설 {club.facilities[k]}단계)</span>}
      <div className="list small">
        {roles.flatMap(role => {
          const meta = STAFF_ROLES[role];
          const hired = staffOf(club, role);
          const rows = hired.map(s => (
            <div key={s.id} className="item">
              <span className={`grade ${s.grade}`}>{s.grade}</span>
              <span className="grow"><b>{s.name}</b> <span className="tiny muted">{meta.name} · {s.age}세 · {s.salary.toFixed(2)}억</span></span>
              {firing === s
                ? <button className="btn xs" onClick={() => { const e = fireStaff(club, s); toast(e ?? `${s.name} 계약 해지 (위약금 ${severanceOf(s).toFixed(2)}억)`); setFiring(null); refresh(); }}>위약금 {severanceOf(s).toFixed(2)}억 · 확인</button>
                : <button className="btn xs ghost" onClick={() => setFiring(s)}>해고</button>}
            </div>
          ));
          if (hired.length < meta.max) rows.push(
            <div key={`${role}-open`} className="item">
              <span className="grade">−</span>
              <span className="grow muted">{meta.name} 빈 자리</span>
              <button className="btn xs primary" onClick={() => setHiring(hiring === role ? null : role)}>{hiring === role ? '닫기' : '고용'}</button>
            </div>,
          );
          if (hiring === role) {
            const cands = c.staffPool.filter(s => s.role === role);
            rows.push(...(cands.length ? cands.map(s => (
              <div key={`cand-${s.id}`} className="item" style={{ paddingLeft: 12 }}>
                <span className={`grade ${s.grade}`}>{s.grade}</span>
                <span className="grow">{s.name} <span className="tiny muted">{s.age}세 · 연봉 {s.salary.toFixed(2)}억</span></span>
                <button className="btn xs orange" onClick={() => { const e = hireStaff(club, c.staffPool, s); toast(e ?? `${meta.name} ${s.name} 고용`); setHiring(null); refresh(); }}>계약</button>
              </div>
            )) : [<div key={`${role}-none`} className="item tiny muted" style={{ paddingLeft: 12 }}>이번 시즌 남은 후보가 없습니다. 다음 시즌에 새 후보가 나옵니다.</div>]));
          }
          return rows;
        })}
      </div>
      <span className="tiny muted">연봉은 시즌 결산 때 나갑니다. 후보는 시즌마다 새로 나옵니다.</span>
    </section>
  );
}

function FacilitySheet({ k, onClose }: { k: Facility; onClose(): void }) {
  const { c, refresh, toast } = useGame();
  const club = userClub(c);
  const lvl = club.facilities[k];
  const cost = upgradeCost(k, lvl);
  return (
    <Sheet title={FACILITY_NAME[k]} onClose={onClose}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <span className="fac" style={{ width: 120, flex: 'none', padding: 4, boxShadow: 'none' }}><span className="art"><FacilityArt k={k} level={lvl} /></span></span>
        <div className="grow stack" style={{ gap: 4 }}>
          <span className="row" style={{ gap: 6 }}><b style={{ color: 'var(--red)' }}>{STAR_TXT[lvl]}</b><Stars n={lvl} /></span>
          <span className="small">{lvl}단계 · {FACILITY_EFFECT[k](lvl)}</span>
          {lvl < 5 && <span className="small c-blue">다음 단계: {FACILITY_EFFECT[k](lvl + 1)}</span>}
        </div>
      </div>
      <button className="btn orange block" disabled={lvl >= 5 || club.cash < cost} onClick={() => { const e = upgrade(c, k); toast(e ?? `${FACILITY_NAME[k]} ${lvl + 1}단계 완공`); refresh(); }}>
        {lvl >= 5 ? '최고 단계' : `${lvl + 1}단계로 증축 · ${cost.toFixed(1)}억`}
      </button>
      {lvl < 5 && club.cash < cost && <span className="tiny muted">자금이 부족합니다 (보유 {money(club.cash)}).</span>}
      {k === 'scout' && <TransferMenu onClose={onClose} />}
      <StaffSection k={k} />
    </Sheet>
  );
}

function Line({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: 'green' | 'red' | 'blue' }) {
  return <div className="item" style={{ minHeight: 40 }}><span className="grow">{k}</span><span className="num" style={{ fontSize: strong ? 18 : 15, fontWeight: strong ? 900 : 500, color: tone ? `var(--${tone})` : undefined }}>{v}</span></div>;
}

export function Market({ onClose }: { onClose(): void }) {
  const { c, refresh, toast, openPlayer } = useGame();
  const [pos, setPos] = useState<'all' | Position>('all');
  const club = userClub(c);
  const open = canTrade(c);
  const list = c.world.freeAgents.filter(p => pos === 'all' || p.position === pos).sort((a, b) => ovr(b) - ovr(a)).slice(0, 40);
  return (
    <Overlay title="FA 시장" onClose={onClose} right={<span className="tiny">{club.roster.length}/{MAX_ROSTER}명</span>}>
      {!open && <p className="tag bad" style={{ whiteSpace: 'normal', margin: 0, padding: 8 }}>지금은 이적 기간이 아닙니다. 비시즌·올스타·오프 FA 턴에 영입할 수 있어요.</p>}
      <div className="seg">{(['all', 'S', 'OH', 'OP', 'MB', 'L'] as const).map(p => <button key={p} aria-pressed={pos === p} onClick={() => setPos(p)}>{p === 'all' ? '전체' : POS_KO[p]}</button>)}</div>
      <section className="card">
        <div className="list">
          {list.length === 0 && <p className="small muted">시장에 남은 선수가 없습니다.</p>}
          {list.map(p => (
            <div key={p.id} className="item">
              <Pos p={p.position} />
              <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => openPlayer(p)}>
                <b>{p.name}</b><div className="tiny muted">{p.age}세 · 요구 {askingSalary(p).toFixed(2)}억</div>
              </button>
              <Ovr v={ovr(p)} />
              <button className="btn sm primary" disabled={!open} onClick={() => { const e = signFA(c, p); toast(e ?? `${p.name} 영입`); refresh(); }}>영입</button>
            </div>
          ))}
        </div>
      </section>
    </Overlay>
  );
}
