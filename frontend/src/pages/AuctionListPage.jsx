import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getRFQs } from '../services/api'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/StatusBadge'
import './AuctionListPage.css'

function AuctionListPage() {
  const { isAdmin } = useAuth()
  const [rfqs, setRfqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('All')

  const fetchData = async () => {
    try {
      setLoading(true)
      const res = await getRFQs()
      setRfqs(res.data || [])
      setError(null)
    } catch (err) {
      setError('Failed to load auctions. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  const filteredRfqs = filter === 'All'
    ? rfqs
    : rfqs.filter(r => r.status === filter)

  const statusCounts = {
    All: rfqs.length,
    Active: rfqs.filter(r => r.status === 'Active').length,
    Closed: rfqs.filter(r => r.status === 'Closed').length,
    'Force Closed': rfqs.filter(r => r.status === 'Force Closed').length,
    Upcoming: rfqs.filter(r => r.status === 'Upcoming').length,
  }

  const formatTime = (dateStr) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }

  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '—'
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (loading && rfqs.length === 0) {
    return (
      <div className="container animate-fade">
        <div className="page-header">
          <h1>British Auctions</h1>
        </div>
        <div className="skeleton-grid">
          {[1,2,3,4].map(i => (
            <div key={i} className="skeleton-card skeleton" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="container animate-fade">
      <div className="page-header">
        <div>
          <h1>British Auctions</h1>
          <p className="page-subtitle">{rfqs.length} total auction{rfqs.length !== 1 ? 's' : ''}</p>
        </div>
        {isAdmin && (
          <Link to="/create" className="btn-primary" id="create-rfq-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Auction
          </Link>
        )}
      </div>

      {error && (
        <div className="error-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
          <button onClick={fetchData} className="retry-btn">Retry</button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="filter-tabs">
        {Object.entries(statusCounts).map(([status, count]) => (
          <button
            key={status}
            className={`filter-tab ${filter === status ? 'active' : ''}`}
            onClick={() => setFilter(status)}
            id={`filter-${status.toLowerCase().replace(' ', '-')}`}
          >
            {status}
            <span className="filter-count">{count}</span>
          </button>
        ))}
      </div>

      {filteredRfqs.length === 0 ? (
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          <h3>No auctions found</h3>
          <p>{filter !== 'All' ? `No ${filter.toLowerCase()} auctions.` : 'Create your first RFQ to get started.'}</p>
          {filter === 'All' && isAdmin && (
            <Link to="/create" className="btn-primary">Create RFQ</Link>
          )}
        </div>
      ) : (
        <div className="auction-grid">
          {filteredRfqs.map((rfq, index) => (
            <Link
              to={`/rfq/${rfq.id}`}
              key={rfq.id}
              className="auction-card"
              id={`auction-card-${rfq.id}`}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className="card-top">
                <span className="rfq-id">RFQ-{String(rfq.id).padStart(4, '0')}</span>
                <StatusBadge status={rfq.status} />
              </div>
              <h3 className="rfq-name">{rfq.name}</h3>

              <div className="card-stats">
                <div className="stat">
                  <span className="stat-label">Lowest Bid</span>
                  <span className="stat-value highlight">{formatCurrency(rfq.current_lowest_bid)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Total Bids</span>
                  <span className="stat-value">{rfq.total_bids}</span>
                </div>
              </div>

              <div className="card-times">
                <div className="time-row">
                  <span className="time-label">Closes</span>
                  <span className="time-value">{formatTime(rfq.bid_close_time)}</span>
                </div>
                <div className="time-row">
                  <span className="time-label">Force Close</span>
                  <span className="time-value">{formatTime(rfq.forced_close_time)}</span>
                </div>
              </div>

              <div className="card-footer">
                <span className="trigger-badge">{rfq.trigger_type?.replace(/_/g, ' ')}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="arrow-icon">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default AuctionListPage
