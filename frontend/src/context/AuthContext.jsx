import { createContext, useContext, useState } from 'react'

// Hardcoded credentials (dummy auth — no backend needed)
const USERS = [
  { email: 'admin@gmail.com', password: 'admin123', role: 'admin', name: 'Admin' },
  { email: 'user@gmail.com',  password: 'user123',  role: 'user',  name: 'User'  },
]

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('rfq_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  const login = (email, password) => {
    const found = USERS.find(u => u.email === email && u.password === password)
    if (!found) return { success: false, message: 'Invalid email or password.' }
    const userData = { email: found.email, role: found.role, name: found.name }
    sessionStorage.setItem('rfq_user', JSON.stringify(userData))
    setUser(userData)
    return { success: true }
  }

  const logout = () => {
    sessionStorage.removeItem('rfq_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin: user?.role === 'admin', isUser: user?.role === 'user' }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
