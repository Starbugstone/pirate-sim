import { Suspense, lazy } from 'react'

const PiratesGame = lazy(() =>
  import('../game/PiratesGame').then((module) => ({ default: module.PiratesGame })),
)

export function PlayPage() {
  return (
    <section className="play-view">
      <Suspense fallback={<div className="route-loading">Preparing the sea...</div>}>
        <PiratesGame />
      </Suspense>
    </section>
  )
}
