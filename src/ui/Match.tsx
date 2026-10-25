import { useEffect, useMemo, useRef, useState } from 'react';
import type { LiveMatch, MatchReport } from '../game/career.ts';
import { clubShort } from '../game/career.ts';
import type { BreakEvent, StepInput } from '../engine/match.ts';
import type { Player, PlayerLine, Tactic } from '../engine/types.ts';
import { advise, assistantCoach } from '../engine/coach.ts';
import { ovr } from '../engine/player.ts';
import { TACTIC_INFO, optName } from '../game/tactics.ts';
import { Crest, Fold, Icon, Overlay, Pos, POS_KO, Sheet, useGame } from './common.tsx';
import { BoxTable, ForecastBox, rowsFromLines, type BoxRow } from './Assist.tsx';
import { forecastLive } from '../game/advice.ts';

interface Point { lines: string[]; score: [number, number]; winner: 0 | 1; set: number }
type Feed = { kind: 'set'; text: string } | { kind: 'note'; text: string } | { kind: 'pt'; p: Point };

/** coaching notes (작전 타임/교체/타임아웃) get their own row in the play-by-play */
const isNote = (l: string) => l.includes('작전') || l.includes('교체') || l.includes('타임아웃');

/** Group the engine's log into points using the §a:b:w markers */
function parse(log: string[]): Feed[] {
  const out: Feed[] = [];
  let buf: string[] = [];
  let set = 1;
  for (const l of log) {
    if (l.startsWith('── ')) { set = Number(l.match(/(\d)/)?.[1] ?? set); out.push({ kind: 'set', text: `${set}세트 시작` }); continue; }
    if (/^\d세트 \d+:\d+$/.test(l)) { out.push({ kind: 'set', text: `${l} 종료` }); continue; }
    if (l.startsWith('§')) {
      const [a, b, w] = l.slice(1).split(':').map(Number);
      out.push({ kind: 'pt', p: { lines: buf, score: [a, b], winner: w as 0 | 1, set } });
      buf = [];
      continue;
    }
    if (isNote(l)) { out.push({ kind: 'note', text: l }); continue; }
    buf.push(l);
  }
  return out;
}

const SPEEDS = [[900, '×1'], [350, '×3'], [80, '×10']] as const;

// formation dots: x/y in % of the mini court (home on the left)
const SPOTS: [number, number][] = [[40, 20], [40, 50], [40, 80], [16, 22], [14, 50], [16, 78]];


function FeedList({ feed, us }: { feed: Feed[]; us: 0 | 1 }) {
  return (
    <div className="feed">
      {feed.map((f, k) => f.kind === 'set'
        ? <div key={k} className="rally sys">{f.text}</div>
        : f.kind === 'note' ? <div key={k} className="rally note">{f.text}</div>
        : <div key={k} className={`rally ${f.p.winner === us ? 'us' : 'them'}`}><span className="pt">{f.p.score[0]}:{f.p.score[1]}</span>{f.p.lines.join(' → ') || '득점'}</div>)}
    </div>
  );
}

export function MatchView({ report: r, speed: speed0 = 0, atEnd, onClose }: { report: MatchReport; speed?: number; atEnd?: boolean; onClose(): void }) {
  const feed = useMemo(() => parse(r.log), [r]);
  const [i, setI] = useState(atEnd ? feed.length : 0);
  const [speed, setSpeed] = useState(Math.max(0, Math.min(2, speed0)));
  const [paused, setPaused] = useState(false);
  const done = i >= feed.length;
  useEffect(() => {
    if (done || paused) return;
    const t = window.setTimeout(() => setI(x => x + 1), SPEEDS[speed][0]);
    return () => window.clearTimeout(t);
  }, [i, speed, paused, done]);

  // live state
  const shown = feed.slice(0, i);
  const lastPt = [...shown].reverse().find(f => f.kind === 'pt') as { p: Point } | undefined;
  const setsDone = r.sets.slice(0, shown.filter(f => f.kind === 'set' && f.text.endsWith('종료')).length);
  const setsWon: [number, number] = done ? r.setsWon : [setsDone.filter(s => s[0] > s[1]).length, setsDone.filter(s => s[1] > s[0]).length];
  const lastIsSetEnd = shown.length > 0 && shown[shown.length - 1].kind === 'set' && (shown[shown.length - 1] as { text: string }).text.endsWith('종료');
  const score = done ? r.sets[r.sets.length - 1] : lastIsSetEnd ? [0, 0] : lastPt?.p.score ?? [0, 0];
  const us = r.userSide;
  const won = r.winner === us;
  const setNo = Math.min(5, setsDone.length + 1);
  // ball lands on the side that lost the rally
  const ball = lastPt ? (lastPt.p.winner === 0 ? [62 + (i * 13) % 30, 18 + (i * 29) % 64] : [8 + (i * 17) % 30, 18 + (i * 23) % 64]) : [50, 50];

  const scoreCard = (
    <section className="card">
      <div className="score-card">
        <div className="team"><Crest id={r.home} size={26} /><span className="ellipsis" style={{ color: us === 0 ? 'var(--orange)' : undefined }}>{clubShort(r.home)}</span></div>
        <div style={{ textAlign: 'center' }}>
          <div className="pts" aria-live="polite">{done ? `${setsWon[0]} : ${setsWon[1]}` : `${score[0]} : ${score[1]}`}</div>
          <div className="tiny muted">{done ? '세트 스코어' : `세트 ${setsWon[0]} : ${setsWon[1]}`}</div>
        </div>
        <div className="team r"><span className="ellipsis" style={{ color: us === 1 ? 'var(--orange)' : undefined }}>{clubShort(r.away)}</span><Crest id={r.away} size={26} /></div>
      </div>
    </section>
  );

  const [tab, setTab] = useState<'feed' | 'players'>('feed');
  const partialBox = useMemo(() => (tab === 'players' && !done ? boxFromLog(shown, r) : []), [tab, i, done, r]);

  if (done) return (
    <Overlay title={`${r.title} 결과`} onClose={onClose} footer={<button className="btn orange" onClick={onClose}>확인</button>}>
      <div className={`banner ${won ? '' : 'lose'}`}>
        {won && <><span className="sparkle" style={{ left: '12%', top: '18%' }}>✦</span><span className="sparkle" style={{ right: '14%', top: '58%' }}>✦</span><span className="sparkle" style={{ left: '24%', bottom: '10%', fontSize: 14 }}>✦</span></>}
        <b>{won ? 'WIN' : 'LOSE'}</b>
        {r.practice && <div className="tiny" style={{ fontWeight: 700, marginTop: 6 }}>연습경기</div>}
      </div>
      {scoreCard}
      <div className="navy-table">
        <table>
          <thead><tr><th>팀</th>{r.sets.map((_, k) => <th key={k}>{k + 1}</th>)}<th>세트</th></tr></thead>
          <tbody>
            {[r.home, r.away].map((id, s) => (
              <tr key={id}><td>{clubShort(id)}</td>{r.sets.map((x, k) => <td key={k} className={x[s] > x[1 - s] ? 'hl' : ''}>{x[s]}</td>)}<td className="hl">{r.setsWon[s]}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <Summary r={r} />
      <section className="card"><h2>경기 기록</h2><Box r={r} /></section>
    </Overlay>
  );

  return (
    <Overlay title={r.title} onClose={onClose} footer={<div className="speedbar">
      <button className="sp" aria-label={paused ? '재생' : '일시정지'} onClick={() => setPaused(p => !p)}>{paused ? '▶' : 'Ⅱ'}</button>
      <span className="grow" />
      {SPEEDS.map(([, n], k) => <button key={n} className="sp" aria-pressed={speed === k} onClick={() => setSpeed(k)}>{n}</button>)}
      <button className="btn orange sm" style={{ minHeight: 38, marginLeft: 6 }} onClick={() => setI(feed.length)}><Icon name="ff" />스킵</button>
    </div>}>
      {scoreCard}
      <div className="set-banner"><b>{setNo}세트</b><div>{lastPt ? (lastPt.p.winner === us ? '우리 득점' : '상대 득점') : '경기 시작'}</div></div>
      <div className="mini-court" aria-hidden="true">
        {SPOTS.map(([x, y], k) => <span key={`h${k}`} className="dotp" style={{ left: `${x}%`, top: `${y}%`, background: us === 0 ? 'var(--orange)' : 'var(--blue)' }} />)}
        {SPOTS.map(([x, y], k) => <span key={`a${k}`} className="dotp" style={{ left: `${100 - x}%`, top: `${y}%`, background: us === 1 ? 'var(--orange)' : 'var(--blue)' }} />)}
        <span className="ball" style={{ left: `${ball[0]}%`, top: `${ball[1]}%` }} />
      </div>
      <div className="setline row wrap" style={{ gap: 6 }}>{setsDone.map((s, k) => <span key={k} className="tag">{k + 1}세트 {s[0]}:{s[1]}</span>)}</div>
      <FeedTabs tab={tab} setTab={setTab} />
      <section className="card">
        {tab === 'feed' ? <><h2>문자 중계</h2><FeedList feed={shown} us={us} /></>
          : <><h2>선수 기록 <span className="tiny muted">지금까지</span></h2><BoxTable rows={partialBox} names={[clubShort(r.home), clubShort(r.away)]} us={us} partial /></>}
      </section>
    </Overlay>
  );
}

function Summary({ r }: { r: MatchReport }) {
  const mine = r.box.filter(b => b.side === r.userSide);
  const pts = (b: typeof mine[number]) => b.kills + b.blocks + b.aces;
  const top = [...mine].sort((a, b) => pts(b) - pts(a))[0];
  const blk = [...mine].sort((a, b) => b.blocks - a.blocks)[0];
  const dig = [...mine].sort((a, b) => b.digs - a.digs)[0];
  const notes = r.log.filter(l => l.includes('작전 변경') || l.includes('교체') || l.includes('에이스') || l.includes('페이크') || l.includes('투 어택')).slice(0, 8);
  return (
    <section className="card">
      <h2>경기 요약</h2>
      <div className="stack small">
        {top && <div className="row"><span className="tag good">최다 득점</span><span className="grow">{top.name} ({top.pos})</span><b>{pts(top)}점</b></div>}
        {blk && blk.blocks > 0 && <div className="row"><span className="tag blue">블로킹</span><span className="grow">{blk.name}</span><b>{blk.blocks}개</b></div>}
        {dig && dig.digs > 0 && <div className="row"><span className="tag orange">디그</span><span className="grow">{dig.name}</span><b>{dig.digs}개</b></div>}
        {notes.map((l, k) => <div key={k} className="tiny muted">{l}</div>)}
      </div>
    </section>
  );
}

function Box({ r }: { r: MatchReport }) {
  const [side, setSide] = useState<0 | 1>(r.userSide);
  const rows = r.box.filter(b => b.side === side).sort((a, b) => (b.kills + b.blocks + b.aces) - (a.kills + a.blocks + a.aces));
  const t = rows.reduce((a, b) => ({ k: a.k + b.kills, at: a.at + b.attacks, bl: a.bl + b.blocks, ac: a.ac + b.aces, se: a.se + b.serveErrors }), { k: 0, at: 0, bl: 0, ac: 0, se: 0 });
  return (
    <>
      <div className="seg light">{[r.home, r.away].map((id, s) => <button key={id} aria-pressed={side === s} onClick={() => setSide(s as 0 | 1)}>{clubShort(id)}</button>)}</div>
      <div className="row wrap small" style={{ gap: 6 }}>
        <span className="tag">공격 성공률 {t.at ? Math.round(100 * t.k / t.at) : 0}%</span><span className="tag">블로킹 {t.bl}</span><span className="tag">서브 에이스 {t.ac}</span><span className="tag">서브 범실 {t.se}</span>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>선수</th><th className="n">득점</th><th className="n">공격</th><th className="n">블록</th><th className="n">서브</th><th className="n">디그</th><th className="n">리시브</th></tr></thead>
          <tbody>
            {rows.map(b => (
              <tr key={b.id}>
                <td><span className="row" style={{ gap: 6 }}><Pos p={b.pos} />{b.name}</span></td>
                <td className="n"><b>{b.kills + b.blocks + b.aces}</b></td>
                <td className="n">{b.kills}/{b.attacks}</td>
                <td className="n">{b.blocks}</td>
                <td className="n">{b.aces}</td>
                <td className="n">{b.digs}</td>
                <td className="n">{b.receives ? `${Math.round(100 * b.recvA / b.receives)}%` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>공격 = 성공/시도, 리시브 = 정확(A) 비율</p>
    </>
  );
}

// ───────────────────────── live match: 작전 타임 · 테크니컬 타임아웃 · 교체 (Julius 2026-10-19) ─────────────────────────

const BREAK_TITLE = { timeout: '작전 타임', technical: '테크니컬 타임아웃', set: '세트 사이 휴식' };

/** The user's match played point by point; play stops at every timeout and between sets so the user can change the plan */
/** full = every rally, bench signals any time · highlight = only the key rallies, decisions at breaks */
export type LiveMode = 'full' | 'highlight';

/** a rally worth showing in highlight mode: a run of 3+, a close finish, or the set's last point */
function isHighlight(e: { setNo: number; score: [number, number]; run: number }) {
  const target = e.setNo === 5 ? 15 : 25;
  const hi = Math.max(...e.score), diff = Math.abs(e.score[0] - e.score[1]);
  return e.run >= 3 || (hi >= target - 3 && diff <= 2) || (hi >= target && diff >= 2);
}

export function LiveMatchView({ live, speed: speed0 = 0, mode = 'full', onDone }: { live: LiveMatch; speed?: number; mode?: LiveMode; onDone(): void }) {
  const us = live.userSide;
  const [log, setLog] = useState<string[]>([]);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [setNo, setSetNo] = useState(1);
  const [sets, setSets] = useState<[number, number][]>([]);
  const [brk, setBrk] = useState<BreakEvent | null>(null);
  const [finished, setFinished] = useState(false);
  const [speed, setSpeed] = useState(Math.max(0, Math.min(2, speed0)));
  const [paused, setPaused] = useState(false);
  const [wantTO, setWantTO] = useState(false);
  const [toLeft, setToLeft] = useState(2);
  const last = useRef<'none' | 'point' | 'break'>('none');
  const input = useRef<StepInput | undefined>(undefined);
  const [tactics, setTactics] = useState<[Tactic, Tactic] | null>([{ ...live.th.team.tactic }, { ...live.ta.team.tactic }]);
  const [oppChanged, setOppChanged] = useState<(keyof Tactic)[]>([]);
  const [signal, setSignal] = useState<Partial<Tactic> | null>(null);
  const [signalOpen, setSignalOpen] = useState(false);
  const quick = useRef(false);
  const [tab, setTab] = useState<'feed' | 'players'>('feed');
  const box = useRef<Map<string, PlayerLine> | null>(null);
  const prevTactics = useRef<[Tactic, Tactic] | null>(null);
  const parsed = useMemo(() => parse(log), [log]);
  const feed = useMemo(() => (mode === 'highlight' ? highlightFeed(parsed) : parsed), [parsed, mode]);
  const setsWon: [number, number] = [sets.filter(x => x[0] > x[1]).length, sets.filter(x => x[1] > x[0]).length];

  function step(inp?: StepInput) {
    if (finished) return;
    let sent = inp ?? input.current;
    input.current = undefined;
    if (!inp && wantTO && last.current === 'point') { sent = { timeout: true }; setWantTO(false); }
    if (!inp && signal && last.current === 'point') { sent = { ...sent, tactic: signal }; setSignal(null); }
    const r = live.steps.next(sent);
    if (r.done) {
      live.result = r.value;
      box.current = r.value.lines;
      setLog(r.value.log.slice());
      setFinished(true);
      return;
    }
    const e = r.value;
    last.current = e.type;
    box.current = e.box;
    setLog(l => [...l, ...e.lines]);
    setScore(e.score);
    if (e.setNo !== setNo) { setSetNo(e.setNo); setToLeft(2); }
    if (e.type === 'point') {
      quick.current = mode === 'highlight' && !isHighlight(e);
      const prev = prevTactics.current, opp = 1 - us;
      if (prev) setOppChanged((Object.keys(e.tactics[opp]) as (keyof Tactic)[]).filter(k => e.tactics[opp][k] !== prev[opp][k]));
      prevTactics.current = e.tactics;
      setTactics(e.tactics);
      if (e.score[0] !== e.score[1] && Math.max(...e.score) >= (e.setNo === 5 ? 15 : 25) && Math.abs(e.score[0] - e.score[1]) >= 2) setSets(x => [...x, e.score]);
    } else {
      if (e.by === us) setToLeft(e.view.timeoutsLeft);
      setBrk(e);
    }
  }

  useEffect(() => {
    if (finished || brk || paused) return;
    const t = window.setTimeout(() => step(), mode === 'highlight' ? (quick.current ? 15 : 1100) : SPEEDS[speed][0]);
    return () => window.clearTimeout(t);
  });
  const doneOnce = useRef(false);
  const done = () => { if (!doneOnce.current) { doneOnce.current = true; onDone(); } };
  useEffect(() => { if (finished) { const t = window.setTimeout(done, 700); return () => window.clearTimeout(t); } }, [finished]);

  /** hand the rest of the match to the assistant coach (or keep the plan) and play it out */
  const { c } = useGame();
  const skip = () => {
    if (finished) return done();
    const auto: StepInput = { auto: c.autoCoach ? assistantCoach : 'none' };
    if (last.current === 'none') live.steps.next();
    let r = live.steps.next(auto);
    while (!r.done) r = live.steps.next(auto);
    live.result = r.value;
    box.current = r.value.lines;
    setBrk(null);
    setLog(r.value.log.slice());
    setSets(r.value.sets.map(x => x.score));
    setFinished(true);
  };

  const lastPt = [...feed].reverse().find(f => f.kind === 'pt') as { p: Point } | undefined;
  const ball = lastPt ? (lastPt.p.winner === 0 ? [62 + (log.length * 13) % 30, 18 + (log.length * 29) % 64] : [8 + (log.length * 17) % 30, 18 + (log.length * 23) % 64]) : [50, 50];
  const sides: [Player, 0 | 1][] = [live.th.team, live.ta.team].flatMap((t, s) => [...t.lineup, t.libero, ...(t.bench ?? [])].map(p => [p, s as 0 | 1] as [Player, 0 | 1]));
  const rows = tab === 'players' && box.current ? rowsFromLines(sides, box.current) : [];
  const ours: [number, number] = us === 0 ? score : [score[1], score[0]];
  const oursSets: [number, number] = us === 0 ? setsWon : [setsWon[1], setsWon[0]];
  const fc = tactics && !finished ? forecastLive(ours, oursSets, tactics[us]) : null;

  return (
    <Overlay title={live.label} onClose={skip} footer={finished ? <button className="btn orange" onClick={done}>결과 보기</button> : <div className="speedbar">
      <button className="sp" aria-label={paused ? '재생' : '일시정지'} onClick={() => setPaused(p => !p)}>{paused ? '▶' : 'Ⅱ'}</button>
      <button className="btn blue3d sm" style={{ minHeight: 38 }} disabled={toLeft <= 0 || wantTO} onClick={() => setWantTO(true)}>{wantTO ? '다음 랠리 후 작전 타임' : `작전 타임 ${toLeft}/2`}</button>
      <span className="grow" />
      {mode === 'full' ? SPEEDS.map(([, n], k) => <button key={n} className="sp" aria-pressed={speed === k} onClick={() => setSpeed(k)}>{n}</button>) : <span className="tag purple">하이라이트</span>}
      <button className="btn orange sm" style={{ minHeight: 38, marginLeft: 4 }} onClick={skip}><Icon name="ff" />스킵</button>
    </div>}>
      <section className="card">
        <div className="score-card">
          <div className="team"><Crest id={live.home} size={26} /><span className="ellipsis" style={{ color: us === 0 ? 'var(--orange)' : undefined }}>{clubShort(live.home)}</span></div>
          <div style={{ textAlign: 'center' }}>
            <div className="pts" aria-live="polite">{finished ? `${setsWon[0]} : ${setsWon[1]}` : `${score[0]} : ${score[1]}`}</div>
            <div className="tiny muted">{finished ? '경기 종료' : `${setNo}세트 · 세트 ${setsWon[0]} : ${setsWon[1]}`}</div>
          </div>
          <div className="team r"><span className="ellipsis" style={{ color: us === 1 ? 'var(--orange)' : undefined }}>{clubShort(live.away)}</span><Crest id={live.away} size={26} /></div>
        </div>
      </section>
      <div className="set-banner"><b>{setNo}세트</b><div>{finished ? '경기 종료' : brk ? BREAK_TITLE[brk.kind] : lastPt ? (lastPt.p.winner === us ? '우리 득점' : '상대 득점') : '경기 시작'}</div></div>
      <div className="mini-court" aria-hidden="true">
        {SPOTS.map(([x, y], k) => <span key={`h${k}`} className="dotp" style={{ left: `${x}%`, top: `${y}%`, background: us === 0 ? 'var(--orange)' : 'var(--blue)' }} />)}
        {SPOTS.map(([x, y], k) => <span key={`a${k}`} className="dotp" style={{ left: `${100 - x}%`, top: `${y}%`, background: us === 1 ? 'var(--orange)' : 'var(--blue)' }} />)}
        <span className="ball" style={{ left: `${ball[0]}%`, top: `${ball[1]}%` }} />
      </div>
      <div className="setline row wrap" style={{ gap: 6 }}>{sets.map((x, k) => <span key={k} className="tag">{k + 1}세트 {x[0]}:{x[1]}</span>)}</div>
      {mode === 'full' && tactics && (
        <section className="card">
          <div className="row between"><b className="small">상대 작전 (실시간){oppChanged.length > 0 && <span className="tag orange" style={{ marginLeft: 6 }}>방금 변경</span>}</b>
            <button className="btn xs orange" disabled={finished} onClick={() => { setPaused(true); setSignalOpen(true); }}>{signal ? '지시 대기 중' : '작전 지시'}</button></div>
          <div className="row wrap" style={{ gap: 6 }}>
            {TACTIC_INFO.filter(a => !a.when || a.when(tactics[1 - us])).map(a => <span key={a.key} className={`tag ${oppChanged.includes(a.key) ? 'orange' : 'blue'}`}>{a.name}: {optName(a.key, tactics[1 - us][a.key] ?? (a.key === 'aim' ? 'weak' : a.key === 'trick' ? 'none' : ''))}</span>)}
          </div>
          {signal && <span className="tiny c-orange">다음 랠리부터 적용: {(Object.keys(signal) as (keyof Tactic)[]).map(k => optName(k, signal[k])).join(', ')}</span>}
          {fc && <ForecastBox f={fc} />}
        </section>
      )}
      {mode === 'highlight' && fc && <ForecastBox f={fc} />}
      <p className="tiny muted" style={{ margin: 0 }}>{mode === 'full'
        ? '풀 중계: 상대 작전이 바뀌는 걸 보면서 "작전 지시"로 언제든 작전을 바꿀 수 있어요 (다음 랠리부터). 교체는 작전 타임·테크니컬 타임아웃·세트 사이에.'
        : '하이라이트: 연속 득점·접전·세트 포인트만 보여줍니다. 작전 타임(세트당 2번), 테크니컬 타임아웃, 세트 사이에 멈춰서 작전과 선수를 바꿀 수 있어요.'}</p>
      <FeedTabs tab={tab} setTab={setTab} />
      <section className="card">
        {tab === 'feed' ? <><h2>문자 중계</h2><FeedList feed={feed} us={us} /></>
          : <><h2>선수 기록 <span className="tiny muted">{finished ? '최종' : '실시간'}</span></h2><BoxTable rows={rows} names={[clubShort(live.home), clubShort(live.away)]} us={us} /></>}
      </section>
      {brk && <BreakPanel e={brk} us={us} onResume={plan => { setBrk(null); step(plan); }} onAuto={skip} />}
      {signalOpen && tactics && <SignalSheet cur={tactics[us]} onClose={() => { setSignalOpen(false); setPaused(false); }} onSend={t => { setSignal(t); setSignalOpen(false); setPaused(false); }} />}
    </Overlay>
  );
}

function FeedTabs({ tab, setTab }: { tab: 'feed' | 'players'; setTab(t: 'feed' | 'players'): void }) {
  return <div className="bigtabs" style={{ ['--n' as string]: 2 }}>{([['feed', '경기 기록'], ['players', '선수 기록']] as const).map(([k, n]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{n}</button>)}</div>;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * A replay only has the play-by-play, so count the shown rallies' lines per player
 * (kills, blocks, aces, digs, errors, attempts). Names come from the final box.
 */
function boxFromLog(feed: Feed[], r: MatchReport): BoxRow[] {
  const rows = new Map<string, BoxRow>();
  for (const b of r.box) if (!rows.has(b.name)) rows.set(b.name, { id: b.id, name: b.name, pos: b.pos, side: b.side, kills: 0, attacks: 0, blocks: 0, aces: 0, digs: 0, errors: 0, recv: 0, recvA: 0 });
  if (!rows.size) return [];
  const N = `(${[...rows.keys()].sort((a, b) => b.length - a.length).map(esc).join('|')})`;
  const KIND = '(?:속공|백어택|오픈 공격)';
  const res = {
    ace: new RegExp(`^${N} .*서브 에이스`), serr: new RegExp(`^${N} 서브 범실`),
    kill: new RegExp(`${N} ${KIND} 득점`), dump: new RegExp(`^${N} (?:세터 )?투 어택`), dumpKill: new RegExp(`^${N} 세터 투 어택\\(패스 페인트\\) 득점`),
    aerr: new RegExp(`${N} ${KIND} 범실`), block: new RegExp(`, ${N} 블로킹 득점`), dig: new RegExp(`→ ${N} 디그`),
    att: new RegExp(`${N} ${KIND}`, 'g'), cover: new RegExp(`^${N} 공격이 블로킹`),
  };
  const get = (m: RegExpMatchArray | null) => (m ? rows.get(m[1]) : undefined);
  for (const f of feed) {
    if (f.kind !== 'pt') continue;
    for (const l of f.p.lines) {
      let x: BoxRow | undefined;
      if ((x = get(l.match(res.ace)))) x.aces++;
      if ((x = get(l.match(res.serr)))) x.errors++;
      if ((x = get(l.match(res.kill)))) x.kills++;
      if ((x = get(l.match(res.dumpKill)))) x.kills++;
      if ((x = get(l.match(res.dump)))) x.attacks++;
      if ((x = get(l.match(res.aerr)))) x.errors++;
      if ((x = get(l.match(res.block)))) x.blocks++;
      if ((x = get(l.match(res.dig)))) x.digs++;
      if ((x = get(l.match(res.cover)))) x.attacks++;
      for (const m of l.matchAll(res.att)) { const y = rows.get(m[1]); if (y) y.attacks++; }
    }
  }
  return [...rows.values()].filter(b => b.kills + b.attacks + b.blocks + b.aces + b.digs + b.errors > 0);
}

/** in highlight mode: set markers, coaching notes and the rallies worth seeing */
function highlightFeed(feed: Feed[]): Feed[] {
  const out: Feed[] = [];
  let run = 0, lastW = -1;
  for (const f of feed) {
    if (f.kind !== 'pt') { out.push(f); if (f.kind === 'set') { run = 0; lastW = -1; } continue; }
    run = f.p.winner === lastW ? run + 1 : 1;
    lastW = f.p.winner;
    if (isHighlight({ setNo: f.p.set, score: f.p.score, run })) out.push(f);
  }
  return out;
}

/** 벤치 작전 지시: change the plan without waiting for a timeout (full broadcast only) */
function SignalSheet({ cur, onClose, onSend }: { cur: Tactic; onClose(): void; onSend(t: Partial<Tactic>): void }) {
  const [draft, setDraft] = useState<Tactic>({ ...cur, aim: cur.aim ?? 'weak', trick: cur.trick ?? 'none' });
  const changed = (Object.keys(draft) as (keyof Tactic)[]).filter(k => draft[k] !== (cur[k] ?? (k === 'aim' ? 'weak' : k === 'trick' ? 'none' : undefined)));
  const send = () => {
    const t: Partial<Tactic> = {};
    for (const k of changed) (t as Record<string, unknown>)[k] = draft[k];
    if (changed.length) onSend(t); else onClose();
  };
  return (
    <Sheet title="작전 지시 (다음 랠리부터)" onClose={onClose}>
      {TACTIC_INFO.filter(a => !a.when || a.when(draft)).map(a => (
        <div key={a.key} className="stack" style={{ gap: 4 }}>
          <b className="small">{a.name}{changed.includes(a.key) && <span className="tag orange" style={{ marginLeft: 6 }}>변경</span>}</b>
          <div className="seg">
            {Object.entries(a.opts).map(([val, o]) => <button key={val} aria-pressed={String(draft[a.key]) === val} onClick={() => setDraft(d => ({ ...d, [a.key]: a.key === 'reception' ? Number(val) : val }))}>{o.name}</button>)}
          </div>
        </div>
      ))}
      <button className="btn orange block" onClick={send}>{changed.length ? `${changed.length}개 지시하기` : '닫기'}</button>
    </Sheet>
  );
}

function BreakPanel({ e, us, onResume, onAuto }: { e: BreakEvent; us: 0 | 1; onResume(plan: StepInput): void; onAuto(): void }) {
  const v = e.view;
  const cur = v.me.tactic;
  const [draft, setDraft] = useState<Tactic>({ ...cur, aim: cur.aim ?? 'weak', trick: cur.trick ?? 'none' });
  const [subs, setSubs] = useState<[number | 'L', Player][]>([]);
  const [pick, setPick] = useState<number | 'L' | null>(null);
  const [open, setOpen] = useState<keyof Tactic | null>(null);
  const advice = useMemo(() => advise(v, e.oppTactic), [e]);
  const fc = forecastLive(v.score, v.setsWon, cur);
  const free = e.kind === 'set';
  const subsLeft = free ? 99 : v.subsLeft - subs.filter(s => s[0] !== 'L').length;
  const changed = (Object.keys(draft) as (keyof Tactic)[]).filter(k => draft[k] !== (cur[k] ?? (k === 'aim' ? 'weak' : k === 'trick' ? 'none' : undefined)));
  const adviceDiff = (Object.keys(advice.tactic) as (keyof Tactic)[]).filter(k => advice.tactic[k] !== draft[k]);
  const opp = e.oppTactic;
  const oa = v.oppAttacks;
  const share = (n: number) => (oa.total ? `${Math.round(100 * n / oa.total)}%` : '-');
  const rv = v.myRecv, rN = rv.A + rv.B + rv.C + rv.aced;
  const myScore = us === 0 ? e.score : [e.score[1], e.score[0]];
  const who = e.kind === 'timeout' ? (e.by === us ? '우리 작전 타임' : '상대 작전 타임') : e.kind === 'technical' ? `테크니컬 타임아웃 (${Math.max(...e.score)}점)` : `${e.setNo}세트 시작 전`;
  const resume = () => {
    const tactic: Partial<Tactic> = {};
    for (const k of changed) (tactic as Record<string, unknown>)[k] = draft[k];
    onResume({ tactic: changed.length ? tactic : undefined, subs });
  };
  const usedBench = new Set(subs.map(s => s[1].id));
  const slots: [number | 'L', Player][] = [...v.me.lineup.map((p, i) => [i, p] as [number, Player]), ['L', v.me.libero]];
  const bench = v.me.bench ?? [];

  return (
    <Overlay title={BREAK_TITLE[e.kind]} onClose={resume} footer={<>
      <button className="btn" onClick={onAuto}>코치에게 맡기기</button>
      <button className="btn orange" onClick={resume}>{changed.length || subs.length ? '바꾸고 재개' : '그대로 재개'}</button>
    </>}>
      <section className="card">
        <div className="row between"><b>{who}</b><span className="tag purple">{e.setNo}세트 · 우리 {myScore[0]} : {myScore[1]} 상대</span></div>
        <div className="tiny muted">세트 {v.setsWon[0]} : {v.setsWon[1]} · 남은 작전 타임 {v.timeoutsLeft} · 남은 교체 {free ? '세트 사이엔 자유' : `${v.subsLeft}회`}</div>
      </section>

      <section className="card">
        <h2>상대 작전 분석</h2>
        <p className="tiny muted" style={{ margin: 0 }}>지금까지 상대가 쓴 작전입니다. 상대도 이번 휴식에 작전을 바꿀 수 있어요. 지고 있는 팀일수록 자주 바꿉니다.</p>
        <div className="row wrap" style={{ gap: 6 }}>
          {TACTIC_INFO.filter(a => !a.when || a.when(opp)).map(a => <span key={a.key} className="tag blue">{a.name}: {optName(a.key, opp[a.key] ?? (a.key === 'aim' ? 'weak' : a.key === 'trick' ? 'none' : ''))}</span>)}
        </div>
        <div className="tiny muted">상대 공격 비율 · 레프트 {share(oa.OH)} · 라이트 {share(oa.OP)} · 센터 {share(oa.MB)} (백어택 {share(oa.back)})</div>
        <div className="tiny muted">우리 리시브 · 정확 {rN ? Math.round(100 * rv.A / rN) : 0}% · 흔들림 {rN ? Math.round(100 * (rv.C + rv.aced) / rN) : 0}%</div>
        <ForecastBox f={fc} title="이번 휴식에 상대가" />
      </section>

      <section className="card">
        <div className="row between"><h2>수석 코치 조언</h2>{adviceDiff.length > 0 && <button className="btn xs blue3d" onClick={() => setDraft(d => ({ ...d, ...advice.tactic }))}>조언대로 바꾸기</button>}</div>
        {advice.notes.length ? (
          <Fold title={`조언 ${advice.notes.length}개 보기`} hint={adviceDiff.length ? `${adviceDiff.length}개 변경 제안` : '지금 작전과 같음'}>
            {advice.notes.map((n, k) => (
              <div key={k} className="coach-note" data-warn={n.warn ? '' : undefined}><b>{n.title}</b><span>{n.text}</span></div>
            ))}
            <p className="tiny muted" style={{ margin: 0 }}>상성을 맞추면 OVR 3~4점만큼 이득이지만, 선수 능력 차이가 크면 작전으로도 못 이길 수 있어요.</p>
          </Fold>
        ) : <span className="small muted">지금 작전이 좋아 보입니다. 그대로 가도 돼요.</span>}
      </section>

      <section className="card">
        <div className="row between"><h2>우리 작전</h2>{changed.length > 0 && <span className="tag orange">{changed.length}개 변경</span>}</div>
        {TACTIC_INFO.filter(a => !a.when || a.when(draft)).map(a => {
          const sel = a.opts[String(draft[a.key])];
          return (
            <div key={a.key} className="stack" style={{ gap: 4 }}>
              <button className="row between axis-head" onClick={() => setOpen(open === a.key ? null : a.key)}>
                <b className="small">{a.name}{changed.includes(a.key) && <span className="tag orange" style={{ marginLeft: 6 }}>변경</span>}</b>
                <span className="tiny muted">{open === a.key ? '설명 닫기' : '설명'}</span>
              </button>
              <div className="seg">
                {Object.entries(a.opts).map(([val, o]) => <button key={val} aria-pressed={String(draft[a.key]) === val} onClick={() => setDraft(d => ({ ...d, [a.key]: a.key === 'reception' ? Number(val) : val }))}>{o.name}</button>)}
              </div>
              {sel && open === a.key && <span className="tiny muted">{sel.what}<br /><b>잘 통함</b> {sel.good}<br /><b>약점</b> {sel.weak}</span>}
            </div>
          );
        })}
      </section>

      <section className="card">
        <div className="row between"><h2>선수 교체</h2><span className="tiny muted">{free ? '세트 사이 교체는 횟수 제한 없음' : `세트당 6회 · 남은 ${subsLeft}회`}</span></div>
        <div className="stack" style={{ gap: 6 }}>
          {slots.map(([slot, p]) => {
            const sub = subs.find(s => s[0] === slot);
            const l = v.line(p);
            return (
              <div key={String(slot)} className="row sub-row">
                <Pos p={slot === 'L' ? 'L' : p.position} />
                <span className="grow small"><b>{p.name}</b>{sub && <> → <b style={{ color: 'var(--orange)' }}>{sub[1].name}</b></>}
                  <div className="tiny muted">체력 {Math.round(p.energy)} · 공격 {l.kills}/{l.attacks} · 범실 {l.attackErrors + l.serveErrors} · 블록 {l.blocks}</div>
                </span>
                {sub ? <button className="btn xs" onClick={() => setSubs(s => s.filter(x => x !== sub))}>취소</button>
                  : <button className="btn xs" disabled={slot !== 'L' && subsLeft <= 0} onClick={() => setPick(slot)}>교체</button>}
              </div>
            );
          })}
        </div>
        {pick !== null && (
          <div className="stack" style={{ gap: 6 }}>
            <b className="small">{pick === 'L' ? '리베로' : POS_KO[v.me.lineup[pick as number].position]} 자리에 들어갈 선수</b>
            {bench.filter(b => !usedBench.has(b.id)).sort((a, b) => {
              const pos = pick === 'L' ? 'L' : v.me.lineup[pick as number].position;
              return (b.position === pos ? 1 : 0) - (a.position === pos ? 1 : 0) || ovr(b) - ovr(a);
            }).map(b => (
              <button key={b.id} className="item" onClick={() => { setSubs(s => [...s, [pick, b]]); setPick(null); }}>
                <Pos p={b.position} /><span className="grow small"><b>{b.name}</b> <span className="tiny muted">OVR {ovr(b)} · 체력 {Math.round(b.energy)}</span></span>
              </button>
            ))}
            {!bench.length && <span className="small muted">벤치에 선수가 없습니다</span>}
            <button className="btn xs ghost" onClick={() => setPick(null)}>닫기</button>
          </div>
        )}
      </section>
    </Overlay>
  );
}
