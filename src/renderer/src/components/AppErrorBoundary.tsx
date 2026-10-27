import { Component, type ReactNode } from 'react'
import { recordCrash } from '../engine/health'

/**
 * Last line of defence for the whole app. Without it a render error anywhere unmounts everything and leaves a blank
 * grey page. It shows what failed, remembers where the student was (the saved screen is cleared so a bad restored
 * screen cannot crash the app again), and reloads once on its own.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } { return { error } }

  componentDidCatch(error: Error): void {
    recordCrash(`Render error: ${error.message}`)
    try {
      localStorage.removeItem('batchlive-ui-session')
      const tried = Number(sessionStorage.getItem('batchlive-crash-reloads') ?? '0')
      if (tried < 1) {
        sessionStorage.setItem('batchlive-crash-reloads', String(tried + 1))
        window.setTimeout(() => window.location.reload(), 1500)
      }
    } catch { /* storage unavailable */ }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return <div role="alert" style={{ padding: 24, fontFamily: 'Segoe UI, sans-serif', color: '#222' }}>
      <h2 style={{ marginTop: 0 }}>BatchLiveTrainer hit a problem and is reloading</h2>
      <p>Your Course 7016 database is autosaved and is not affected. If this screen stays, press Reload.</p>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#fff', border: '1px solid #aaa', padding: 8 }}>{this.state.error.message}</pre>
      <button type="button" onClick={() => window.location.reload()}>Reload</button>
    </div>
  }
}
