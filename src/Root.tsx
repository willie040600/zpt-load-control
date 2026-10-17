import { App } from './App'
import { HubApp } from './hub/HubApp'
import { useStore } from './store'

export function Root() {
  const view = useStore((s) => s.view)
  return view === 'hub' ? <HubApp /> : <App />
}
