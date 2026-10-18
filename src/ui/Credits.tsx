import { Icon } from './common.tsx';

// 만든이 · contact (title screen page; also opened from 구단운영)
export const MAKER = {
  name: 'Julius Kim',
  role: '기획 · 디자인 · 개발',
  portfolio: 'https://julius-portfolio-2026.vercel.app',
  mail: 'kia1026@naver.com',
};

export function CreditsBody() {
  return (
    <>
      <section className="card">
        <div className="section-title">만든이</div>
        <div><b style={{ fontSize: 18 }}>{MAKER.name}</b><div className="small muted">{MAKER.role}</div></div>
        <p className="small muted" style={{ margin: 0 }}>V-스파이크 매니저는 개인 프로젝트로 만든 배구단 경영 시뮬레이션입니다. 팀·선수 이름은 모두 가상입니다.</p>
      </section>
      <section className="card">
        <div className="section-title">Contact</div>
        <p className="small" style={{ margin: 0 }}>버그 제보, 의견, 협업 제안 모두 환영합니다.</p>
        <div className="list">
          <a className="item" href={MAKER.portfolio} target="_blank" rel="noopener noreferrer">
            <div className="grow"><b>포트폴리오</b><div className="tiny muted ellipsis">{MAKER.portfolio.replace('https://', '')}</div></div>
            <span className="chev"><Icon name="chev" /></span>
          </a>
          <a className="item" href={`mailto:${MAKER.mail}?subject=${encodeURIComponent('[V-스파이크 매니저] 문의')}`}>
            <div className="grow"><b>메일 보내기</b><div className="tiny muted">{MAKER.mail}</div></div>
            <span className="chev"><Icon name="chev" /></span>
          </a>
        </div>
      </section>
    </>
  );
}

export function Credits({ onBack }: { onBack(): void }) {
  return (
    <div className="app">
      <div className="subbar gutter">
        <button className="icon-btn" onClick={onBack} aria-label="뒤로"><Icon name="back" /></button>
        <b className="grow ov-title">만든이 · Contact</b>
      </div>
      <main className="content gutter" style={{ paddingBottom: 32 }}><CreditsBody /></main>
    </div>
  );
}
