import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

interface ErrorBoundaryProps {
  /** What stopped, in the person's words: "LED preview", "this dialog". */
  label: string
  children: ReactNode
  /** The whole app: offer a reload, since nothing else is left on screen. */
  root?: boolean
  /** Dialogs: the notice floats over the workspace instead of taking space. */
  floating?: boolean
  /** A change here clears the error, as when the workspace tab changes. */
  resetKey?: unknown
}

interface ErrorBoundaryState {
  error: Error | null
  resetKey: unknown
}

/**
 * Keeps one throwing component from unmounting the whole app. The region shows
 * what stopped and a way back, and the rest of the app keeps running, so
 * autosave goes on holding the project.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    return Object.is(props.resetKey, state.resetKey) ? null : { error: null, resetKey: props.resetKey }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`${this.props.label} stopped:`, error, info.componentStack)
  }

  private retry = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const { label, root, floating } = this.props
    const className = root ? styles.root : `${styles.region} ${floating ? styles.floating : ''}`
    return (
      <div className={className} role="alert">
        <p className={styles.title}>{label} stopped working.</p>
        <p className={styles.detail}>{error.message || error.name}</p>
        <div className={styles.actions}>
          {!root && <button type="button" className={styles.button} onClick={this.retry}>Try again</button>}
          <button type="button" className={styles.button} onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    )
  }
}
