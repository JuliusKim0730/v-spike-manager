import { useEffect, useMemo, useState } from 'react';
import type { MatchReport } from '../game/career.ts';
import { clubShort } from '../game/career.ts';
import { Crest, Icon, Overlay, Pos } from './common.tsx';

interface Point { lines: string[]; score: [number, number]; winner: 0 | 1; set: number }
type Feed = { kind: 'set'; text: string } | { kind: 'pt'; p: Point };

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
    buf.push(l);
  }
  return out;
}

const SPEEDS = [[900, '×1'], [350, '×3'], [80, '×10']] as const;

// formation dots: x/y in % of the mini court (home on the left)
const SPOTS: [number, number][] = [[40, 20], [40, 50], [40, 80], [16, 22], [14, 50], [16, 78]];

export function MatchView({ report: r, speed: speed0 = 0, onClose }: { report: MatchReport; speed?: number; onClose(): void }) {
  const feed = useMemo(() => parse(r.log), [r]);
  const [i, setI] = useState(0);
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
      <section className="card">
        <h2>문자 중계</h2>
        <div className="feed">
          {shown.map((f, k) => f.kind === 'set'
            ? <div key={k} className="rally sys">{f.text}</div>
            : <div key={k} className={`rally ${f.p.winner === us ? 'us' : 'them'}`}><span className="pt">{f.p.score[0]}:{f.p.score[1]}</span>{f.p.lines.filter(l => !l.includes('작전') && !l.includes('교체')).join(' → ') || '득점'}{f.p.lines.filter(l => l.includes('작전') || l.includes('교체')).map(l => <div key={l} className="tiny" style={{ color: 'var(--blue)' }}>{l}</div>)}</div>)}
        </div>
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
  const notes = r.log.filter(l => l.includes('작전') || l.includes('교체') || l.includes('에이스')).slice(0, 6);
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
