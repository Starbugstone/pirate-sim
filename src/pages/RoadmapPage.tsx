import { roadmap } from '../data/pirateContent'

export function RoadmapPage() {
  return (
    <div className="page-shell">
      <section className="content-section">
        <div className="section-heading">
          <p className="eyebrow">Delivery status</p>
          <h1 className="section-title">Roadmap and performance envelope</h1>
        </div>

        <div className="feature-grid roadmap-grid">
          <article className="card feature-card">
            <p className="card-kicker">Next</p>
            <h2>Immediate focus</h2>
            <ul className="stack-list">
              {roadmap.next.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="card feature-card">
            <p className="card-kicker">Completed</p>
            <h2>Gameplay already in place</h2>
            <ul className="stack-list">
              {roadmap.completed.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="card feature-card">
            <p className="card-kicker">Performance</p>
            <h2>Distance tiers</h2>
            <ul className="detail-list">
              {roadmap.performance.map(([label, value]) => (
                <li key={label}>
                  <strong>{label}</strong>
                  <span>{value}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </div>
  )
}
