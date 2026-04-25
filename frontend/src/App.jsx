import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import AuctionListPage from './pages/AuctionListPage'
import AuctionDetailPage from './pages/AuctionDetailPage'
import CreateRFQPage from './pages/CreateRFQPage'
import './App.css'

function App() {
  return (
    <>
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<AuctionListPage />} />
          <Route path="/rfq/:id" element={<AuctionDetailPage />} />
          <Route path="/create" element={<CreateRFQPage />} />
        </Routes>
      </main>
    </>
  )
}

export default App
