import { NavLink, Outlet, useLocation } from 'react-router-dom'

export function Layout() {
  const location = useLocation()
  const isGameRoute = location.pathname === '/play'

  return (
    <div className="app-shell">
      <header className="site-header">
        <NavLink className="brand" to="/">
          <span className="brand-mark">PS</span>
          <span>
            <strong>Pirate Sim</strong>
            <small>Standalone React build</small>
          </span>
        </NavLink>

        <nav className="site-nav" aria-label="Primary">
          <NavLink to="/">Overview</NavLink>
          <NavLink to="/play">Play</NavLink>
          <NavLink to="/world">World</NavLink>
          <NavLink to="/roadmap">Roadmap</NavLink>
        </nav>

        <NavLink className="launch-link" to="/play">
          Launch
        </NavLink>
      </header>

      <main className={isGameRoute ? 'site-main site-main--game' : 'site-main'}>
        <Outlet />
      </main>

      <footer className="site-footer">
        <p>Built from the original pirate sim demo, now hosted in a dedicated React app.</p>
      </footer>
    </div>
  )
}
