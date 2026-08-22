import React from 'react'
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[AASU CMS ErrorBoundary Caught]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="dashboard-content-wrapper" style={{ padding: '40px 24px' }}>
          <div className="error-state" style={{ textAlign: 'center', maxWidth: '500px', margin: '40px auto' }}>
            <AlertTriangle size={48} className="error-state-icon" style={{ color: '#DC2626', marginBottom: '16px' }} />
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--dash-navy)' }}>
              Editor Error Occurred
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--dash-text-secondary)', marginBottom: '24px' }}>
              {this.state.error?.message || 'An unexpected error occurred while rendering the editor.'}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                className="edit-action-btn"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                <RefreshCw size={14} />
                <span>Retry</span>
              </button>
              <a
                href="/dashboard/posts"
                className="edit-action-btn"
                style={{ textDecoration: 'none' }}
              >
                <ArrowLeft size={14} />
                <span>Back to Posts</span>
              </a>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
