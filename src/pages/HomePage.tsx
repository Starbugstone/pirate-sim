import { Link } from 'react-router-dom'
import { appOverview, controls, coreFeatures, headlineStats, shipStats } from '../data/pirateContent'

export function HomePage() {
  return (
    <div className="page-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Standalone rebuild</p>
          <h1>{appOverview.title}</h1>
          <p className="hero-subtitle">{appOverview.subtitle}</p>
          <p className="hero-text">{appOverview.summary}</p>

          <div className="hero-actions">
            <Link className="button-primary" to="/play">
              Play the current build
            </Link>
            <Link className="button-secondary" to="/world">
              Inspect the systems
            </Link>
          </div>
        </div>

        <aside className="hero-note card">
          <p className="card-kicker">Why this version exists</p>
          <h2>From embedded demo to product candidate</h2>
          <p>
            The original pirate sim lived inside a multi-demo portfolio. This app isolates the
            game, keeps the working Three.js implementation, and turns the supporting
            documentation into a clearer product frame.
          </p>
        </aside>
      </section>

      <section className="stat-grid">
        {headlineStats.map((item) => (
          <article key={item.label} className="card stat-card">
            <p className="card-kicker">{item.label}</p>
            <h2>{item.value}</h2>
            <p>{item.note}</p>
          </article>
        ))}
      </section>

      <section className="content-section">
        <div className="section-heading">
          <p className="eyebrow">Core pillars</p>
          <h2 className="section-title">What already works in the build</h2>
        </div>

        <div className="feature-grid">
          {coreFeatures.map((feature) => (
            <article key={feature.title} className="card feature-card">
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="content-section dual-layout">
        <article className="card">
          <p className="card-kicker">Controls</p>
          <h2>Ship handling</h2>
          <ul className="detail-list">
            {controls.map(([key, action]) => (
              <li key={key}>
                <strong>{key}</strong>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <p className="card-kicker">Base ship profile</p>
          <h2>Starting capability</h2>
          <ul className="detail-list">
            {shipStats.map(([label, value]) => (
              <li key={label}>
                <strong>{label}</strong>
                <span>{value}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  )
}
