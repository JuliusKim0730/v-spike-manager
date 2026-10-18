import { useState } from 'react';
import type { Tactic } from '../engine/types.ts';
import type { Pro } from '../engine/league/types.ts';
import { BLOCK_TXT, clubColor, DEF_TXT, DIST_TXT, isFirstTeam, ovr, PRESETS, SERVE_TXT, SLOT_LABEL, SLOT_POS, TEMPO_TXT, userClub, userTeam, type Preset } from '../game/career.ts';
import { Avatar } from './art.tsx';
import { Ovr, Pos, POS_KO, Sheet, useGame } from './common.tsx';

type AxisDef = { key: keyof Tactic; name: string; help: string; opts: Record<string, string> };
const AXES: AxisDef[] = [
  { key: 'distribution', name: '① 공격 배분', help: '누구에게 공을 많이 줄까. 한 명에게 몰면 강하지만 에이스 마크 블로킹에 걸리기 쉬워요.', opts: DIST_TXT },
  { key: 'tempo', name: '② 공격 템포', help: '빠른 공은 블로킹을 따돌리지만, 리시브가 흔들리면 범실이 늘어요.', opts: TEMPO_TXT },
  { key: 'serve', name: '③ 서브', help: '강서브는 에이스와 범실이 모두 늘고, 목적타는 상대의 약한 리시버를 노립니다.', opts: SERVE_TXT },
  { key: 'block', name: '④ 블로킹', help: '따라가기는 높은 공에 강하고, 예측은 속공을 잡지만 날개 공격에 뚫려요. 에이스 마크는 한 명을 집중 마크.', opts: BLOCK_TXT },
  { key: 'defense', name: '⑤ 수비', help: '강타 대비는 뒤로 깊게, 연타 대비는 앞으로 당겨 섭니다.', opts: DEF_TXT },
  { key: 'reception', name: '리시브 인원', help: '3인 리시브는 안정적이지만 레프트의 공격 준비가 늦어져요. 2인은 강서브·목적타에 약합니다.', opts: { 2: '2인', 3: '3인' } },
];

const MATCHUPS: [string, string, string][] = [
  ['목적타 서브', '리시브 약한 선수가 있는 팀', '3인 리시브 팀'],
  ['강서브', '리시브 2인 팀', '우리 서브가 약할 때'],
  ['빠른 공', '따라가기 블로킹 팀', '리시브가 흔들릴 때'],
  ['에이스 마크', '라이트·레프트 집중 팀', '중앙 활용 팀'],
  ['예측 블로킹', '중앙 활용 팀', '고른 배분 + 빠른 공'],
  ['연타 대비', '기교파 공격 팀', '파워 공격 팀'],
];

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
        {AXES.map(a => (
          <div key={a.key} className="stack" style={{ gap: 4 }}>
            <b className="small">{a.name}</b>
            <div className="seg">
              {Object.entries(a.opts).map(([v, n]) => <button key={v} aria-pressed={String(c.tactic[a.key]) === v} onClick={() => change(a.key, v)}>{n}</button>)}
            </div>
            <span className="tiny muted">{a.help}</span>
          </div>
        ))}
      </section>
      <section className="card">
        <div className="row between">
          <div className="grow"><b>경기 중 자동 대응</b><div className="tiny muted">세트 사이·작전 타임에 상대 공격 패턴을 읽고 블로킹과 서브를 바꿉니다. 끄면 정한 작전으로 끝까지 갑니다.</div></div>
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
        <p className="small muted" style={{ margin: 0 }}>상성을 맞추면 OVR 3~4점만큼 이득입니다. 배구는 "서브로 리시브를 흔든다 → 상대 공격이 단순해진다 → 블로킹으로 잡는다"가 기본 뼈대예요.</p>
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
