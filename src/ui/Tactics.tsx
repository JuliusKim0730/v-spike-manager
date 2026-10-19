import { useState } from 'react';
import type { Tactic } from '../engine/types.ts';
import type { Pro } from '../engine/league/types.ts';
import { clubColor, isFirstTeam, ovr, PRESETS, SLOT_LABEL, SLOT_POS, userClub, userTeam, type Preset } from '../game/career.ts';
import { MATCHUPS, TACTIC_INFO } from '../game/tactics.ts';
import { Avatar } from './art.tsx';
import { Ovr, Pos, POS_KO, Sheet, useGame } from './common.tsx';

export function Tactics() {
  const [view, setView] = useState<'lineup' | 'tactic' | 'chart'>('lineup');
  return (
    <>
      <div className="bigtabs" style={{ ['--n' as string]: 3 }}>
        {([['lineup', '라인업'], ['tactic', '작전'], ['chart', '상성표']] as const).map(([k, n]) => <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{n}</button>)}
      </div>
      {view === 'lineup' && <Lineup />}
      {view === 'tactic' && <TacticPanel />}
      {view === 'chart' && <Chart />}
    </>
  );
}

const FRONT = [1, 2, 3], BACK = [4, 5, 0];

function Lineup() {
  const { c, refresh, openPlayer } = useGame();
  const [pick, setPick] = useState<number | null>(null);
  const club = userClub(c);
  const starters = userTeam(c).starters;
  const used = new Set(starters.map(p => p.id));
  const bench = club.roster.filter(p => !used.has(p.id) && isFirstTeam(club, p));
  const power = starters.reduce((a, p, i) => a + ovr(p, SLOT_POS[i]), 0) / 7;
  const card = (i: number) => {
    const p = starters[i];
    const off = p && p.position !== SLOT_POS[i];
    return (
      <button key={i} className={`pcard ${c.lineup[i] ? 'manual' : ''} ${off ? 'off' : ''}`} onClick={() => setPick(i)} aria-label={`${SLOT_LABEL[i]} 바꾸기`}>
        <span className="slot">{SLOT_LABEL[i]}</span>
        <span className="ava"><Avatar id={p?.id ?? 'x'} color={clubColor(c.userId)} foreign={p?.foreign} size={46} /></span>
        {p && <Pos p={p.position} />}
        <span className="nm">{p?.name ?? '-'}</span>
        {p && <Ovr v={ovr(p, SLOT_POS[i])} />}
      </button>
    );
  };
  return (
    <>
      <div className="court">
        <span className="net" />
        <span className="lbl">어택 라인</span>
        <div className="court-row">{FRONT.map(card)}</div>
        <div className="court-row">{BACK.map(card)}</div>
      </div>
      <div className="lib-row">
        {card(6)}
        <div className="stack" style={{ gap: 6 }}>
          <div className="powerbar"><span className="grow small">선발 전력</span><span className="v">{power.toFixed(1)}</span></div>
          <button className="btn sm" onClick={() => { c.lineup = c.lineup.map(() => null); refresh(); }}>자동 설정</button>
        </div>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>카드를 눌러 선수를 바꿉니다. 파란 테두리 = 직접 고름, 주황 테두리 = 다른 포지션 기용(그 포지션 기준 OVR).</p>
      <section className="card">
        <div className="row between"><h2>교체 (1군 벤치)</h2><span className="tiny muted">{bench.length}명</span></div>
        <div className="bench">
          {bench.map(p => (
            <button key={p.id} className="pcard" onClick={() => openPlayer(p)}>
              <span className="ava"><Avatar id={p.id} color={clubColor(c.userId)} foreign={p.foreign} size={46} /></span>
              <Pos p={p.position} />
              <span className="nm">{p.name}</span>
              <Ovr v={ovr(p)} />
            </button>
          ))}
        </div>
      </section>
      {pick !== null && <SlotPicker slot={pick} current={starters[pick]} onClose={() => setPick(null)} />}
    </>
  );
}

function SlotPicker({ slot, current, onClose }: { slot: number; current?: Pro; onClose(): void }) {
  const { c, refresh } = useGame();
  const club = userClub(c);
  const pos = SLOT_POS[slot];
  const set = (id: string | null) => {
    if (id) c.lineup = c.lineup.map(x => (x === id ? null : x));
    c.lineup[slot] = id;
    refresh(); onClose();
  };
  const list = club.roster.filter(p => p.injured === 0)
    .sort((a, b) => (b.position === pos ? 1 : 0) - (a.position === pos ? 1 : 0) || ovr(b, pos) - ovr(a, pos));
  return (
    <Sheet title={`${SLOT_LABEL[slot]} 선택`} onClose={onClose}>
      <button className={`item`} onClick={() => set(null)}><span className="grow"><b>자동 선택</b><div className="tiny muted">가장 좋은 {POS_KO[pos]}를 알아서 넣습니다</div></span></button>
      <div className="list">
        {list.map(p => (
          <button key={p.id} className="item" onClick={() => set(p.id)} style={p.id === current?.id ? { background: 'var(--blue-soft)' } : undefined}>
            <Pos p={p.position} />
            <span className="grow"><b>{p.name}</b><div className="tiny muted">{p.age}세{!isFirstTeam(club, p) ? ' · 2군' : ''}{p.position !== pos ? ` · ${POS_KO[pos]}로 기용` : ''}</div></span>
            <Ovr v={ovr(p, pos)} />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function TacticPanel() {
  const { c, refresh } = useGame();
  const set = (p: Preset) => { if (p !== 'custom') { c.tactic = { ...PRESETS[p].tactic }; c.preset = p; refresh(); } };
  const change = (k: keyof Tactic, v: string) => {
    (c.tactic as unknown as Record<string, unknown>)[k] = k === 'reception' ? Number(v) : v;
    c.preset = 'custom';
    refresh();
  };
  return (
    <>
      <section className="card">
        <h2>작전 프리셋</h2>
        <p className="small muted" style={{ margin: 0 }}>처음엔 셋 중 하나만 골라도 됩니다. 세부 조정을 바꾸면 '직접 설정'이 돼요.</p>
        <div className="stack">
          {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map(k => (
            <button key={k} className="choice" aria-pressed={c.preset === k} onClick={() => set(k)}><b>{PRESETS[k].name}</b><span>{PRESETS[k].desc}</span></button>
          ))}
        </div>
      </section>
      <section className="card">
        <div className="row between"><h2>세부 조정</h2>{c.preset === 'custom' && <span className="tag blue">직접 설정</span>}</div>
        {TACTIC_INFO.filter(a => !a.when || a.when(c.tactic)).map(a => {
          const cur = String(c.tactic[a.key] ?? (a.key === 'aim' ? 'weak' : a.key === 'trick' ? 'none' : ''));
          const sel = a.opts[cur];
          return (
            <div key={a.key} className="stack" style={{ gap: 4 }}>
              <b className="small">{a.name}</b>
              <span className="tiny muted">{a.intro}</span>
              <div className="seg">
                {Object.entries(a.opts).map(([v, o]) => <button key={v} aria-pressed={cur === v} onClick={() => change(a.key, v)}>{o.name}</button>)}
              </div>
              {sel && (
                <div className="opt-help">
                  <div>{sel.what}</div>
                  <div><b className="good">잘 통함</b> {sel.good}</div>
                  <div><b className="weak">약점</b> {sel.weak}</div>
                </div>
              )}
            </div>
          );
        })}
      </section>
      <section className="card">
        <div className="row between">
          <div className="grow"><b>수석 코치에게 맡기기</b><div className="tiny muted">'결과만' 진행하거나 경기 중 스킵하면 수석 코치가 휴식 때마다 상대 작전을 보고 조언대로 바꾸고, 작전 타임·교체도 합니다. 끄면 정한 작전과 선발로 끝까지 갑니다.</div></div>
          <button className="btn sm" aria-pressed={c.autoCoach} onClick={() => { c.autoCoach = !c.autoCoach; refresh(); }} style={c.autoCoach ? { background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)' } : undefined}>{c.autoCoach ? '켜짐' : '꺼짐'}</button>
        </div>
      </section>
    </>
  );
}

function Chart() {
  return (
    <>
      <section className="card">
        <h2>상성표</h2>
        <p className="small muted" style={{ margin: 0 }}>상성을 맞추면 OVR 3~4점만큼 이득입니다. 다만 선수 능력 차이가 그보다 크면 상성을 맞춰도 질 수 있어요. 배구는 "서브로 리시브를 흔든다 → 상대 공격이 단순해진다 → 블로킹으로 잡는다"가 기본 뼈대예요.</p>
        <p className="small muted" style={{ margin: 0 }}>경기 중에는 작전 타임(세트당 2번), 테크니컬 타임아웃(1~4세트, 한 팀이 8점·16점), 세트 사이마다 상대 작전이 보이고 수석 코치가 맞춤 작전을 조언해 줍니다.</p>
        <div className="tablewrap">
          <table>
            <thead><tr><th>우리 작전</th><th>잘 먹히는 상대</th><th>약한 상대</th></tr></thead>
            <tbody>{MATCHUPS.map(m => <tr key={m[0]}><td><b>{m[0]}</b></td><td>{m[1]}</td><td className="muted">{m[2]}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}
