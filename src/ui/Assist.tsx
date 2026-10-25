/**
 * Shared helpers for both game modes (Julius 2026-10-25):
 * 행동 리포트 card, 옵션 card (추천 모드), the pre-match recommendation, the opponent forecast and the player box table.
 */
import { useState } from 'react';
import type { Player, PlayerLine, Position, Tactic } from '../engine/types.ts';
import type { Pro } from '../engine/league/types.ts';
import { recommendOn } from '../game/career.ts';
import { STAT_KO, type TurnReport } from '../game/report.ts';
import { forecastPre, recommend, type Forecast } from '../game/advice.ts';
import { axisInfo, optName } from '../game/tactics.ts';
import { Fold, Pos, useGame } from './common.tsx';

const sign = (d: number, digits = 1) => `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(digits)}`;
function Delta({ d, digits = 1 }: { d: number; digits?: number }) {
  if (Math.abs(d) < 0.05) return <span className="delta muted">±0</span>;
  return <span className={`delta ${d > 0 ? 'up' : 'down'}`}>{sign(d, digits)}</span>;
}
function Gauge({ k, v }: { k: string; v: [number, number] }) {
  const d = v[1] - v[0];
  return <span className="tag">{k} {Math.round(v[0])}→{Math.round(v[1])}{Math.abs(d) >= 0.5 && <span className={`delta ${d > 0 ? 'up' : 'down'}`}> {d > 0 ? '▲' : '▼'}</span>}</span>;
}

// ───────────────────────── 행동 리포트 ─────────────────────────

function ReportRowView({ r }: { r: TurnReport['rows'][number] }) {
  const d = r.ovr[1] - r.ovr[0];
  return (
    <div className="rep-row">
      <div className="row" style={{ gap: 6 }}>
        <Pos p={r.pos} /><b className="small grow ellipsis">{r.name}</b>
        {r.joined ? <span className="tag blue">새로 합류</span> : <span className="small num">OVR {r.ovr[0].toFixed(1)}→{r.ovr[1].toFixed(1)} <Delta d={d} /></span>}
        {r.injured && <span className="tag bad">부상</span>}
      </div>
      {!r.joined && (
        <div className="chips">
          {r.stats.slice(0, 4).map(([k, v]) => <span key={k} className="tag">{STAT_KO[k]} <Delta d={v} /></span>)}
          <Gauge k="체력" v={r.energy} /><Gauge k="컨디션" v={r.cond} /><Gauge k="감각" v={r.sense} />
        </div>
      )}
    </div>
  );
}

/** What the last action did to each player: OVR and stat deltas, 체력·컨디션·경기감각 before → after */
export function ReportCard() {
  const { c, refresh } = useGame();
  const r = c.report;
  if (!r) return null;
  const rows = r.rows.filter(x => !x.joined);
  const up = rows.filter(x => x.ovr[1] - x.ovr[0] >= 0.05).length;
  const down = rows.filter(x => x.ovr[1] - x.ovr[0] <= -0.05).length;
  const top = r.rows.filter(x => x.joined || Math.abs(x.ovr[1] - x.ovr[0]) >= 0.05 || x.injured).slice(0, 3);
  return (
    <section className="card" aria-label="행동 리포트">
      <div className="row between"><h2>행동 리포트</h2><button className="btn xs ghost" onClick={() => { c.report = null; refresh(); }}>닫기</button></div>
      <div className="small"><b>{r.title}</b>{r.msg && <span className="muted"> · {r.msg}</span>}</div>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="tag good">능력치 상승 {up}명</span>{down > 0 && <span className="tag bad">하락 {down}명</span>}
        <Gauge k="평균 체력" v={r.avg.energy} /><Gauge k="컨디션" v={r.avg.cond} /><Gauge k="감각" v={r.avg.sense} />
      </div>
      {r.notes.map(n => <div key={n} className="tiny c-purple" style={{ fontWeight: 700 }}>{n}</div>)}
      {top.length > 0 && <div>{top.map(x => <ReportRowView key={x.id} r={x} />)}</div>}
      <Fold title={`선수별 전체 변화 (${r.rows.length}명)`}>
        <div>{r.rows.map(x => <ReportRowView key={x.id} r={x} />)}</div>
      </Fold>
    </section>
  );
}

// ───────────────────────── 옵션 ─────────────────────────

export function OptionsCard() {
  const { c, refresh } = useGame();
  const on = recommendOn(c);
  return (
    <section className="card">
      <h2>옵션</h2>
      <div className="toggle-row">
        <div className="grow"><b className="small">추천 모드</b><div className="tiny muted">경기 준비 화면에서 분석된 상대 작전을 보고 우리 작전의 유불리와 추천 작전을 알려줍니다.</div></div>
        <button className="btn sm" aria-pressed={on} onClick={() => { c.recommend = !on; refresh(); }} style={on ? { background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)' } : undefined}>{on ? '켜짐' : '꺼짐'}</button>
      </div>
    </section>
  );
}

// ───────────────────────── 경기 준비: 추천 모드 ─────────────────────────

export function ForecastBox({ f, title = '상대 작전 전망' }: { f: Forecast; title?: string }) {
  const word = f.level === 'high' ? '바뀔 가능성 높음' : f.level === 'mid' ? '바뀔 수도 있음' : '유지할 가능성 높음';
  return (
    <div className="forecast" data-level={f.level}>
      <span><b>{title}: {word}</b> <span className="tiny muted">(약 {f.pct}%)</span></span>
      <span className="tiny">{f.text}</span>
      {f.hints.map(h => <span key={h} className="tiny muted">· {h}</span>)}
    </div>
  );
}

const TONE: Record<string, [string, string]> = { good: ['good', '유리'], bad: ['bad', '불리'], even: ['', '보통'] };

/**
 * 추천 모드 card for the pre-match sheet. `me`/`them`: starting sevens [S, OH, MB, OP, OH, MB, L];
 * `known`: the opponent axes the analysts read. Hidden when the option is off.
 */
export function RecommendPanel({ me, them, known, ourOvr, oppOvr, onEdit }: { me: Pro[]; them: Pro[]; known: Partial<Tactic>; ourOvr: number; oppOvr: number; onEdit(): void }) {
  const { c, refresh, toast } = useGame();
  const rec = recommend(c.tactic, me as Player[], them as Player[], known);
  const fc = forecastPre(ourOvr, oppOvr, c.tactic);
  if (!recommendOn(c)) return null;
  const changes = rec.picks.filter(p => (c.tactic[p.key] ?? (p.key === 'aim' ? 'weak' : p.key === 'trick' ? 'none' : undefined)) !== p.value);
  const good = rec.verdicts.filter(v => v.tone === 'good').length, bad = rec.verdicts.filter(v => v.tone === 'bad').length;
  const apply = () => {
    c.tactic = { ...c.tactic, ...rec.tactic };
    c.preset = 'custom';
    refresh();
    toast(`추천 작전 ${changes.length}개 적용`);
  };
  return (
    <section className="card" aria-label="추천 모드">
      <div className="row between"><h2>추천 모드</h2><span className="tiny muted">옵션에서 끌 수 있어요</span></div>
      {rec.known.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>전력분석이 부족해 상대 작전을 읽지 못했습니다. 안정형 작전으로 시작해 경기 중 상대 작전을 확인하세요.</p>
      ) : (
        <>
          <div className="small">
            상대 작전 {rec.known.filter(k => k !== 'aim' || known.serve === 'target').map(k => `${axisInfo(k).name} ${optName(k, known[k])}`).join(' · ')}
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="tag">우리 작전 상성</span>
            <span className="tag good">유리 {good}</span><span className="tag bad">불리 {bad}</span>
            <span className="tag blue">추천 변경 {changes.length}개</span>
          </div>
          {rec.verdicts.length > 0 && (
            <Fold title="우리 작전의 특징 · 상성" hint={`${rec.verdicts.length}개`}>
              {rec.verdicts.map((v, i) => <div key={i} className="verdict"><span className={`tag ${TONE[v.tone][0]}`}>{TONE[v.tone][1]}</span><span>{v.text}</span></div>)}
            </Fold>
          )}
          {rec.picks.length > 0 && (
            <Fold title="추천 작전과 이유" hint={changes.length ? `${changes.length}개 바꾸기` : '지금 작전 그대로'}>
              {rec.picks.map(p => {
                const same = (c.tactic[p.key] ?? (p.key === 'aim' ? 'weak' : p.key === 'trick' ? 'none' : undefined)) === p.value;
                return (
                  <div key={p.key} className="coach-note" data-warn={p.warn ? '' : undefined}>
                    <b>{axisInfo(p.key).name}: {optName(p.key, p.value)} {same ? <span className="tag good">적용 중</span> : <span className="tag orange">지금 {optName(p.key, c.tactic[p.key] ?? (p.key === 'aim' ? 'weak' : 'none'))}</span>}</b>
                    <span>{p.why}</span>
                    {p.warn && <span>⚠ {p.warn}</span>}
                  </div>
                );
              })}
            </Fold>
          )}
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm blue3d grow" disabled={!changes.length} onClick={apply}>{changes.length ? '추천대로 적용' : '이미 추천 작전입니다'}</button>
            <button className="btn sm" onClick={onEdit}>직접 바꾸기</button>
          </div>
        </>
      )}
      <ForecastBox f={fc} title="경기 중 상대 작전" />
    </section>
  );
}

// ───────────────────────── 선수 기록 ─────────────────────────

export interface BoxRow { id: string; name: string; pos: Position; side: 0 | 1; kills: number; attacks: number; blocks: number; aces: number; digs: number; errors: number; recv: number; recvA: number }

export const rowsFromLines = (players: [Player, 0 | 1][], lines: Map<string, PlayerLine>): BoxRow[] => {
  const seen = new Set<string>();
  const out: BoxRow[] = [];
  for (const [p, side] of players) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const l = lines.get(p.id);
    if (!l) continue;
    out.push({ id: p.id, name: p.name, pos: p.position, side, kills: l.kills, attacks: l.attacks, blocks: l.blocks, aces: l.aces, digs: l.digs, errors: l.attackErrors + l.serveErrors, recv: l.receives, recvA: l.recvA });
  }
  return out;
};

/** Players' match lines so far, one team at a time */
export function BoxTable({ rows, names, us, partial }: { rows: BoxRow[]; names: [string, string]; us: 0 | 1; partial?: boolean }) {
  const [side, setSide] = useState<0 | 1>(us);
  const list = rows.filter(b => b.side === side).sort((a, b) => (b.kills + b.blocks + b.aces) - (a.kills + a.blocks + a.aces) || b.digs - a.digs);
  const t = list.reduce((a, b) => ({ k: a.k + b.kills, at: a.at + b.attacks, bl: a.bl + b.blocks, ac: a.ac + b.aces, e: a.e + b.errors }), { k: 0, at: 0, bl: 0, ac: 0, e: 0 });
  return (
    <>
      <div className="seg light">{names.map((n, s) => <button key={s} aria-pressed={side === s} onClick={() => setSide(s as 0 | 1)}>{n}</button>)}</div>
      <div className="row wrap small" style={{ gap: 6 }}>
        <span className="tag">공격 {t.at ? `${Math.round(100 * t.k / t.at)}%` : t.k}</span><span className="tag">블로킹 {t.bl}</span><span className="tag">에이스 {t.ac}</span><span className="tag">범실 {t.e}</span>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>선수</th><th className="n">득점</th><th className="n">공격</th><th className="n">블록</th><th className="n">서브</th><th className="n">디그</th><th className="n">범실</th>{!partial && <th className="n">리시브</th>}</tr></thead>
          <tbody>
            {list.map(b => (
              <tr key={b.id}>
                <td><span className="row" style={{ gap: 6 }}><Pos p={b.pos} />{b.name}</span></td>
                <td className="n"><b>{b.kills + b.blocks + b.aces}</b></td>
                <td className="n">{b.attacks ? `${b.kills}/${b.attacks}` : b.kills}</td>
                <td className="n">{b.blocks}</td>
                <td className="n">{b.aces}</td>
                <td className="n">{b.digs}</td>
                <td className="n">{b.errors}</td>
                {!partial && <td className="n">{b.recv ? `${Math.round(100 * b.recvA / b.recv)}%` : '-'}</td>}
              </tr>
            ))}
            {!list.length && <tr><td colSpan={8} className="muted small">아직 기록이 없습니다</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>공격 = 성공/시도{!partial && ', 리시브 = 정확(A) 비율'}</p>
    </>
  );
}
