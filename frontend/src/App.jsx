import { useEffect } from 'react'
import './App.css'
import { getHealth } from './services/api'

function App() {
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const data = await getHealth()
        console.log('Health check response:', data)
      } catch (error) {
        console.error('Failed to check health:', error)
      }
    }

    fetchHealth()
  }, [])

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>RFQ Auction System</h1>
      </header>
      <main className="app-main">
        <p>Welcome to the RFQ Auction System</p>
      </main>
    </div>
  )
}

export default App
