import { StrictMode, Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('App crash:', error, info) }
  render() {
    if (this.state.error) {
      const e = this.state.error as Error
      return (
        <div style={{ padding: '2rem', fontFamily: 'monospace', color: '#CC3400', background: '#111827', minHeight: '100vh' }}>
          <div style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>App Error</div>
          <div style={{ fontSize: '0.875rem', color: '#ff6666' }}>{e.message}</div>
          <pre style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#aa4444', whiteSpace: 'pre-wrap' }}>{e.stack}</pre>
        </div>
      )
    }
    return this.state.error === null ? this.props.children : null
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
