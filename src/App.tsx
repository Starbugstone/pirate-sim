import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'

const HomePage = lazy(() => import('./pages/HomePage').then((module) => ({ default: module.HomePage })))
const PlayPage = lazy(() => import('./pages/PlayPage').then((module) => ({ default: module.PlayPage })))
const RoadmapPage = lazy(() => import('./pages/RoadmapPage').then((module) => ({ default: module.RoadmapPage })))
const WorldPage = lazy(() => import('./pages/WorldPage').then((module) => ({ default: module.WorldPage })))

function App() {
  return (
    <Suspense fallback={<div className="route-loading">Loading...</div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="/world" element={<WorldPage />} />
          <Route path="/roadmap" element={<RoadmapPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default App
