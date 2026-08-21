import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/auth.css'

export default function LoginPage() {
  const { user, profile, loading, signIn } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Redirect to dashboard if user is already authenticated
  useEffect(() => {
    if (!loading && user && profile) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, profile, loading, navigate])

  const getFriendlyErrorMessage = (err) => {
    if (!err) return null
    const message = err.message || ''

    if (message.includes('access-denied:profile-not-found')) {
      return 'Access Denied: No administrator profile exists for this account.'
    }
    if (message.includes('access-denied:inactive-account')) {
      return 'Access Denied: Your account is currently inactive. Please contact the system administrator.'
    }
    if (message.toLowerCase().includes('invalid login credentials')) {
      return 'Incorrect email or password. Please verify your credentials and try again.'
    }
    if (
      message.toLowerCase().includes('failed to fetch') ||
      message.toLowerCase().includes('networkerror') ||
      message.toLowerCase().includes('network connection')
    ) {
      return 'Connection failed. Please check your internet connection and try again.'
    }
    if (message.toLowerCase().includes('email not confirmed')) {
      return 'Your email address has not been confirmed. Please check your email inbox.'
    }
    if (message.toLowerCase().includes('rate limit')) {
      return 'Too many login attempts. Please try again in a few minutes.'
    }

    return 'Unable to sign in. Please verify your email and password, or contact support if the issue persists.'
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await signIn(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      console.error('Login error:', err)
      setError(err)
      setIsSubmitting(false)
    }
  }

  // Show a blank loading screen if session is initializing
  if (loading && !user) {
    return (
      <div className="auth-loader-container">
        <div className="auth-loader"></div>
        <p>Loading AASU Portal...</p>
      </div>
    )
  }

  return (
    <div className="login-container">
      {/* Left side: AASU Identity (hidden on mobile) */}
      <div className="login-left-panel">
        <div className="african-pattern-overlay"></div>
        <div className="login-left-content">
          <div className="brand-badge">AASU Portal</div>
          <h2 className="brand-headline">ALL-AFRICA STUDENTS UNION</h2>
          <p className="brand-subheadline">
            Union des Étudiants d'Afrique | الاتحاد العام لطلاب أفريقيا
          </p>
          <p className="brand-welcome">
            Access the central administration platform to manage regional structures, advocacy campaigns, and student representatives across the continent.
          </p>
          <div className="brand-accent-line"></div>
        </div>
      </div>

      {/* Right side: Login Form */}
      <div className="login-right-panel">
        <div className="login-form-wrapper">
          <div className="login-form-header">
            <img src="/aasu-logo.png" alt="AASU Logo" className="login-logo" />
            <h1>Sign In</h1>
            <p>Enter your administrator credentials to access the CMS</p>
          </div>

          {error && (
            <div className="error-alert" role="alert">
              <svg className="error-icon" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="error-message">{getFriendlyErrorMessage(error)}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@aasu.org"
                required
                autoComplete="email"
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <div className="password-label-row">
                <label htmlFor="password">Password</label>
                <button
                  type="button"
                  className="forgot-password-link"
                  onClick={() =>
                    alert(
                      'Forgot password is placeholder only. Please contact the AASU IT Department for account assistance.'
                    )
                  }
                  tabIndex={0}
                >
                  Forgot password?
                </button>
              </div>
              <div className="password-input-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={isSubmitting}
                  tabIndex={0}
                >
                  {showPassword ? (
                    <svg
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="form-options">
              <label className="remember-me-label" htmlFor="rememberMe">
                <input
                  id="rememberMe"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={isSubmitting}
                />
                <span>Remember me</span>
              </label>
            </div>

            <button
              type="submit"
              className={`signin-button ${isSubmitting ? 'loading' : ''}`}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner"></span>
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="login-form-footer">
            <p>&copy; {new Date().getFullYear()} All-Africa Students Union. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
