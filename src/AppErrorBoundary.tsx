import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { failed: boolean }

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Keep sensitive runtime details out of the public UI. */ }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="app-recovery"><p className="kicker">RESERVEFLOW</p><h1>Let’s get you back in.</h1><p>An old session or unexpected account detail interrupted this screen. Your reservations and payments are safe.</p><button onClick={() => { sessionStorage.removeItem('reserveflow.account'); window.location.assign(window.location.pathname) }}>Sign out and return home</button></main>
  }
}
