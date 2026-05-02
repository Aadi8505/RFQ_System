import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import LoginPage from './pages/LoginPage'
import AuctionListPage from './pages/AuctionListPage'
import AuctionDetailPage from './pages/AuctionDetailPage'
import CreateRFQPage from './pages/CreateRFQPage'
import UserManagementPage from './pages/UserManagementPage'
import './App.css'

function ProtectedRoute({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AdminRoute({ children }) {
  const { user, isAdmin } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}

function App() {
  const { user } = useAuth()

  return (
    <>
      {user && <Navbar />}
      <main className="main-content">
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
          <Route path="/" element={<ProtectedRoute><AuctionListPage /></ProtectedRoute>} />
          <Route path="/rfq/:id" element={<ProtectedRoute><AuctionDetailPage /></ProtectedRoute>} />
          <Route path="/create" element={<AdminRoute><CreateRFQPage /></AdminRoute>} />
          <Route path="/users" element={<AdminRoute><UserManagementPage /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  )
}

export default App
