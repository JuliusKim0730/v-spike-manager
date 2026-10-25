/** 신인감독모드 start: club name and colour, then the staff draft (design/ROOKIE-MODE.md §6) */
import { useMemo, useState } from 'react';
import type { Career } from '../game/career.ts';
import { newRookie, STAFF_LIMIT, STAFF_ROLE, staffCheck, staffPool, type Staff, type StaffRole } from '../game/rookie.ts';
import { slotInfo, SLOTS } from '../game/storage.ts';
import { CrestArt } from './art.tsx';
import { Icon } from './common.tsx';

const COLORS = ['#f8731c', '#7c5cff', '#1e6fe8', '#e2384d', '#1f9d55', '#0aa5c9', '#e0559b', '#4b5563'];

export function RookieSetup({ onBack, onStart }: { onBack(): void; onStart(c: Career): void }) {
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const pool = useMemo(() => staffPool(seed), [seed]);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('서울 언더독스');
  const [short, setShort] = useState('언더독스');
  const [color, setColor] = useState(COLORS[0]);
  const free = SLOTS.find(s => !slotInfo(s));
  const [slot, setSlot] = useState(free ?? 0);
  const [hired, setHired] = useState<Staff[]>([]);
  const cost = hired.reduce((a, s) => a + s.cost, 0);
  const err = staffCheck(hired);
  const toggle = (s: Staff) => {
    const same = hired.find(h => h.role === s.role);
    setHired(same?.id === s.id ? hired.filter(h => h !== same) : [...hired.filter(h => h.role !== s.role), s]);
  };
  const okName = name.trim().length >= 2 && short.trim().length >= 1;
  return (
    <div className="app">
      <div className="subbar gutter">
        <button className="icon-btn" onClick={step === 1 ? onBack : () => setStep(1)} aria-label="뒤로"><Icon name="back" /></button>
        <b className="grow ov-title">신인감독모드 · {step === 1 ? '구단 만들기' : '스태프 드래프트'}</b>
      </div>
      <main className="content gutter" style={{ paddingBottom: 32 }}>
        {step === 1 && <>
          <section className="card">
            <p className="small" style={{ margin: 0 }}>V-리그 8번째 구단을 꿈꾸는 신생팀의 감독이 되었습니다. <b>63일</b> 동안 트라이아웃으로 선수를 뽑고, 1부·해외·고교-대학 팀과 <b>7번의 공식전</b>을 치러 방송 시청률과 성적으로 창단 기업을 설득하세요.</p>
          </section>
          <section className="card">
            <div className="section-title">1 · 구단 이름</div>
            <input className="input" value={name} maxLength={16} onChange={e => setName(e.target.value)} aria-label="구단 이름" />
            <div className="section-title">약칭 (중계·순위표)</div>
            <input className="input" value={short} maxLength={6} onChange={e => setShort(e.target.value)} aria-label="약칭" />
            <div className="section-title">2 · 팀 컬러</div>
            <div className="row wrap" style={{ gap: 8 }}>
              {COLORS.map(col => <button key={col} className="swatch" aria-pressed={color === col} aria-label={col} onClick={() => setColor(col)} style={{ background: col }} />)}
            </div>
            <div className="row" style={{ gap: 10 }}><CrestArt color={color} letter={short[0] ?? '?'} size={44} /><b>{name}</b></div>
            <div className="section-title">저장 슬롯</div>
            <div className="seg">{SLOTS.map(s => <button key={s} aria-pressed={slot === s} onClick={() => setSlot(s)}>슬롯 {s + 1}{slotInfo(s) ? ' (덮어씀)' : ''}</button>)}</div>
          </section>
          <button className="btn go block" disabled={!okName} onClick={() => setStep(2)}>스태프 드래프트로</button>
        </>}
        {step === 2 && <>
          <section className="card">
            <p className="small" style={{ margin: 0 }}>직책마다 한 명씩, 최대 <b>{STAFF_LIMIT.heads}명</b>을 <b>{STAFF_LIMIT.budget}억</b> 안에서 고용합니다. 전원 S급은 불가능해요. 스태프 계약금은 시작 자금 5억에서 나갑니다.</p>
            <div className="row between small"><span>고용 {hired.length}/{STAFF_LIMIT.heads}명</span><b className={cost > STAFF_LIMIT.budget ? 'c-red' : 'c-blue'}>{cost.toFixed(2)} / {STAFF_LIMIT.budget}억</b></div>
            <div className="progress"><div className="track"><i style={{ width: `${Math.min(100, (cost / STAFF_LIMIT.budget) * 100)}%` }} /></div></div>
          </section>
          {(Object.keys(STAFF_ROLE) as StaffRole[]).map(role => (
            <section key={role} className="card">
              <div className="row between"><h2>{STAFF_ROLE[role][0]}</h2><span className="tiny muted">{STAFF_ROLE[role][1]}</span></div>
              <div className="list">
                {pool.filter(s => s.role === role).map(s => {
                  const on = hired.some(h => h.id === s.id);
                  return (
                    <button key={s.id} className="item" aria-pressed={on} onClick={() => toggle(s)} style={on ? { background: 'var(--blue-soft)' } : undefined}>
                      <span className={`grade ${s.grade}`}>{s.grade}</span>
                      <div className="grow"><b>{s.name}</b><div className="tiny muted">{s.note}</div></div>
                      <b className="small">{s.cost.toFixed(2)}억</b>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {err && <p className="tag bad" style={{ whiteSpace: 'normal' }}>{err}</p>}
          {!hired.some(h => h.role === 'coach') && <p className="tiny muted" style={{ margin: 0 }}>수석코치가 없으면 성장이 느리고 트라이아웃 추천이 자주 빗나갑니다.</p>}
          <button className="btn go block" disabled={!!err} onClick={() => onStart(newRookie({ slot, name: name.trim(), short: short.trim(), color, staff: hired, seed }))}>
            트라이아웃 열기
          </button>
        </>}
      </main>
    </div>
  );
}
