import { createContext, useContext, useState, useCallback } from 'react'
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('rfq_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  const [token, setToken] = useState(() => localStorage.getItem('rfq_token') || null)

  // Helper to save auth state
  const saveAuth = (tokenVal, userVal) => {
    localStorage.setItem('rfq_token', tokenVal)
    localStorage.setItem('rfq_user', JSON.stringify(userVal))
    setToken(tokenVal)
    setUser(userVal)
  }

  // ── Login (email + password) ────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/auth/login`, { email, password })
      if (!data.success) return { success: false, message: data.message || 'Login failed.' }
      saveAuth(data.token, data.user)
      return { success: true }
    } catch (err) {
      const message = err.response?.data?.message || 'Invalid email or password.'
      return { success: false, message }
    }
  }, [])

  // ── Register (email + password — users only) ───────────────────────────────
  const register = useCallback(async (name, email, password) => {
    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/auth/register`, { name, email, password })
      if (!data.success) return { success: false, message: data.message || 'Registration failed.' }
      saveAuth(data.token, data.user)
      return { success: true }
    } catch (err) {
      const message = err.response?.data?.message || 'Registration failed.'
      return { success: false, message }
    }
  }, [])

  // ── Google Login ────────────────────────────────────────────────────────────
  const googleLogin = useCallback(async (credential) => {
    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/auth/google`, { credential })
      if (!data.success) return { success: false, message: data.message || 'Google login failed.' }
      saveAuth(data.token, data.user)
      return { success: true }
    } catch (err) {
      const message = err.response?.data?.message || 'Google login failed.'
      return { success: false, message }
    }
  }, [])

  // ── Logout ──────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem('rfq_token')
    localStorage.removeItem('rfq_user')
    setToken(null)
    setUser(null)
  }, [])

  const isAdmin = user?.role === 'admin'
  const isUser = user?.role === 'user'

  return (
    <AuthContext.Provider value={{ user, token, login, register, googleLogin, logout, isAdmin, isUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
