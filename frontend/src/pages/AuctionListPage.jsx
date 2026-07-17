import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getRFQs, getCategories } from '../services/api'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/StatusBadge'
import CategoryIcon from '../components/CategoryIcon'
import './AuctionListPage.css'

function AuctionListPage() {
  const { user, isUser } = useAuth()
  const [rfqs, setRfqs] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Filtering and searching states
  const [filter, setFilter] = useState('All')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchData = async () => {
    try {
      const res = await getRFQs()
      setRfqs(res.data || [])
      setError(null)
    } catch (err) {
      setError('Failed to load auctions. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  const fetchCategoryData = async () => {
    try {
      const res = await getCategories()
      if (res.success) {
        setCategories(res.data || [])
      }
    } catch (err) {
      console.error('Failed to load categories', err)
    }
  }

  useEffect(() => {
    fetchCategoryData()
    fetchData()
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  // Combined client-side filtering
  const filteredRfqs = rfqs.filter((rfq) => {
    // 1. Status Filter
    if (filter !== 'All' && rfq.status !== filter) return false

    // 2. Category Filter
    if (selectedCategory && rfq.category_id !== parseInt(selectedCategory)) return false

    // 3. Search Query (matches name, description or category name)
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesName = rfq.name.toLowerCase().includes(query)
      const matchesDesc = rfq.description?.toLowerCase().includes(query)
      const matchesCategory = rfq.category_name?.toLowerCase().includes(query)
      if (!matchesName && !matchesDesc && !matchesCategory) return false
    }

    return true
  })

  // Dynamic counts for status filter tabs
  const getStatusCount = (statusVal) => {
    return rfqs.filter((rfq) => {
      if (selectedCategory && rfq.category_id !== parseInt(selectedCategory)) return false
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesName = rfq.name.toLowerCase().includes(query)
        const matchesDesc = rfq.description?.toLowerCase().includes(query)
        const matchesCategory = rfq.category_name?.toLowerCase().includes(query)
        if (!matchesName && !matchesDesc && !matchesCategory) return false
      }
      return statusVal === 'All' ? true : rfq.status === statusVal
    }).length
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
          <h1>Service Requests</h1>
        </div>
        <div className="skeleton-grid">
          {[1, 2, 3, 4].map(i => (
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
          <h1>Service Requests</h1>
          <p className="page-subtitle">{filteredRfqs.length} total request{filteredRfqs.length !== 1 ? 's' : ''}</p>
        </div>
        {/* Only users can post services — admin cannot */}
        {isUser && (
          <Link to="/create" className="btn-primary" id="create-rfq-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Post Service
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

      {/* Filter and Search Bar */}
      <div className="controls-row">
        <div className="search-wrap">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            className="search-control"
            placeholder="Search services..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="select-wrap">
          <select
            className="category-control"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="filter-tabs">
        {['All', 'Active', 'Upcoming', 'Closed', 'Force Closed'].map((status) => (
          <button
            key={status}
            className={`filter-tab ${filter === status ? 'active' : ''}`}
            onClick={() => setFilter(status)}
            id={`filter-${status.toLowerCase().replace(' ', '-')}`}
          >
            {status}
            <span className="filter-count">{getStatusCount(status)}</span>
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
          <h3>No service requests found</h3>
          <p>{filter !== 'All' || selectedCategory || searchQuery ? 'No service requests match your criteria.' : 'Post your first service request to get started.'}</p>
          {filter === 'All' && !selectedCategory && !searchQuery && isUser && (
            <Link to="/create" className="btn-primary">Post Service</Link>
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
                <div className="badge-row">
                  <span className="rfq-id">RFQ-{String(rfq.id).padStart(4, '0')}</span>
                  {rfq.category_name && (
                    <span className="category-badge">
                      <CategoryIcon icon={rfq.category_icon} size={12} className="badge-icon" />
                      {rfq.category_name}
                    </span>
                  )}
                </div>
                <StatusBadge status={rfq.status} />
              </div>
              <h3 className="rfq-name">{rfq.name}</h3>

              {rfq.description && (
                <p className="rfq-desc-snippet">
                  {rfq.description.length > 90
                    ? `${rfq.description.substring(0, 90)}...`
                    : rfq.description}
                </p>
              )}

              <div className="card-meta">
                <span className="meta-posted-by">
                  Posted by: <strong>{rfq.posted_by_name || 'System'}</strong>
                  {rfq.created_by === user?.id && <span className="own-tag">You</span>}
                </span>
              </div>

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
