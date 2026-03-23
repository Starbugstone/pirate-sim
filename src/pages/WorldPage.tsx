import { enemyTypes, upgrades, worldRules } from '../data/pirateContent'

export function WorldPage() {
  return (
    <div className="page-shell">
      <section className="content-section">
        <div className="section-heading">
          <p className="eyebrow">Simulation model</p>
          <h1 className="section-title">World, factions, and progression</h1>
        </div>

        <div className="feature-grid">
          <article className="card feature-card">
            <p className="card-kicker">World rules</p>
            <ul className="detail-list">
              {worldRules.map(([label, value]) => (
                <li key={label}>
                  <strong>{label}</strong>
                  <span>{value}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="card feature-card">
            <p className="card-kicker">Enemy roster</p>
            <ul className="detail-list">
              {enemyTypes.map(([label, value]) => (
                <li key={label}>
                  <strong>{label}</strong>
                  <span>{value}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="card feature-card">
            <p className="card-kicker">Harbour upgrades</p>
            <ul className="detail-list">
              {upgrades.map(([label, value]) => (
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
