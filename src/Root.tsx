import { App } from './App'
import { HubApp } from './hub/HubApp'
import { useStore } from './store'
import { CompareApp } from './compare/CompareApp'

export function Root() {
  const view = useStore((s) => s.view)
  return view === 'compare' ? <CompareApp /> : view === 'hub' ? <HubApp /> : <App />
}
