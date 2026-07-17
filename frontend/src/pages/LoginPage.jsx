import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import './LoginPage.css'

function LoginPage() {
  const { login, googleLogin } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await login(email, password)
    if (result.success) {
      navigate('/')
    } else {
      setError(result.message)
      setLoading(false)
    }
  }

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('')
    setLoading(true)
    const result = await googleLogin(credentialResponse.credential)
    if (result.success) {
      navigate('/')
    } else {
      setError(result.message)
      setLoading(false)
    }
  }

  const handleGoogleError = () => {
    setError('Google Sign-In failed. Please try again.')
  }

  return (
    <div className="login-page">
      {/* Animated background orbs */}
      <div className="login-bg-orb login-bg-orb-1" />
      <div className="login-bg-orb login-bg-orb-2" />
      <div className="login-bg-orb login-bg-orb-3" />

      <div className="login-container animate-fade">
        <div className="login-card">
          {/* Logo / Brand */}
          <div className="login-brand">
            <div className="login-logo">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 className="login-title">LazyList</h1>
            <p className="login-subtitle">Sign in to access service requests & bidding</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="login-error animate-fade">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label htmlFor="login-email">Email Address</label>
              <div className="login-input-wrap">
                <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="M22 4L12 13 2 4"/>
                </svg>
                <input
                  type="email"
                  id="login-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  autoFocus
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <div className="login-input-wrap">
                <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-toggle-pw"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="login-submit" disabled={loading} id="login-submit-btn">
              {loading ? (
                <span className="login-spinner" />
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="login-divider">
            <span>or sign in with</span>
          </div>

          {/* Google Sign-In wrapper */}
          <div className="google-login-wrapper">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              theme="filled_blue"
              size="large"
              shape="rectangular"
              text="signin_with"
              uxMode="redirect"
            />
          </div>

          {/* Register Link */}
          <div className="login-register-link">
            <p>Don't have an account? <Link to="/register">Register here</Link></p>
          </div>

          <div className="login-hints">
            <h2 className="login-hints-title">Default Credentials</h2>
            <div className="login-hint-cards">
              <div 
                className="login-hint-card"
                onClick={() => {
                  setEmail('admin@rfq.com');
                  setPassword('admin123');
                }}
              >
                <span className="hint-role admin-role">Admin</span>
                <span className="hint-email">admin@rfq.com</span>
                <span className="hint-desc">PW: admin123 (Seeded)</span>
              </div>
              <div 
                className="login-hint-card"
                onClick={() => {
                  setEmail('ekart@rfq.com');
                  setPassword('user123');
                }}
              >
                <span className="hint-role user-role">User</span>
                <span className="hint-email">ekart@rfq.com</span>
                <span className="hint-desc">Create via Register page</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
