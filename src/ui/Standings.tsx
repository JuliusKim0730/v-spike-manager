import { useState } from 'react';
import { clubShort, DIV_NAME, standings, starterAvg, userClub } from '../game/career.ts';
import { Crest, useGame } from './common.tsx';

const STAGE = { semi: '준PO', po: 'PO', final: '챔프전', done: '종료' };

export function Standings() {
  const { c } = useGame();
  const [div, setDiv] = useState(userClub(c).division as number);
  const table = standings(c, div);
  return (
    <>
      <div className="seg">{DIV_NAME.map((n, d) => <button key={d} aria-pressed={div === d} onClick={() => setDiv(d)}>{n}</button>)}</div>
      <section className="card">
        <div className="row between"><h2>{DIV_NAME[div]} 순위</h2><span className="tiny muted">승점: 3:0·3:1 승 3점, 3:2 승 2점, 2:3 패 1점</span></div>
        <div className="tablewrap">
          <table>
            <thead><tr><th className="n">#</th><th>팀</th><th className="n">승</th><th className="n">패</th><th className="n">승점</th><th className="n">세트</th><th className="n">전력</th></tr></thead>
            <tbody>
              {table.map((x, i) => (
                <tr key={x.id} className={[x.id === c.userId ? 'me' : '', i < 4 ? 'zone-up' : '', div < 2 && i >= 6 ? 'zone-down' : ''].join(' ')}>
                  <td className="n">{i + 1}</td>
                  <td><span className="row" style={{ gap: 6 }}><Crest id={x.id} size={22} />{clubShort(x.id)}</span></td>
                  <td className="n">{x.wins}</td><td className="n">{x.losses}</td><td className="n"><b>{x.points}</b></td>
                  <td className="n">{x.setsWon}-{x.setsLost}</td><td className="n">{starterAvg(x).toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>초록 = 포스트시즌(1~4위){div < 2 ? ', 빨강 = 강등권(7·8위)' : ''}. {div > 0 ? '챔피언 결정전 진출 2팀은 승격합니다.' : ''}</p>
      </section>
      {c.playoffs && (
        <section className="card">
          <h2>포스트시즌</h2>
          {c.playoffs.map((po, d) => (
            <div key={d} className="row between small">
              <b>{DIV_NAME[d]}</b>
              {po.series ? <span>{STAGE[po.stage]} {clubShort(po.series.hi)} {po.series.w[0]} : {po.series.w[1]} {clubShort(po.series.lo)}</span>
                : <span>🏆 {clubShort(po.champ!)}</span>}
            </div>
          ))}
        </section>
      )}
      {c.results.length > 0 && (
        <section className="card">
          <h2>우리 경기 결과</h2>
          <div className="list">
            {[...c.results].reverse().map((r, i) => (
              <div key={i} className="item small">
                <span className={`tag ${r.win ? 'good' : 'bad'}`}>{r.win ? '승' : '패'}</span>
                <span className="grow">{r.label} · {r.home ? '홈' : '원정'} vs {clubShort(r.opp)}</span>
                <b className="num" style={{ fontSize: 17 }}>{r.setsWon[0]}:{r.setsWon[1]}</b>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
