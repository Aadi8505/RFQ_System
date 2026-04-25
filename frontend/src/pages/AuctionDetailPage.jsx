import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getRFQById, placeBid } from '../services/api'
import StatusBadge from '../components/StatusBadge'
import './AuctionDetailPage.css'

function AuctionDetailPage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [bidLoading, setBidLoading] = useState(false)
  const [bidResult, setBidResult] = useState(null)
  const [bidError, setBidError] = useState(null)
  const [activeTab, setActiveTab] = useState('rankings')
  const [expandedBid, setExpandedBid] = useState(null)

  const [bidForm, setBidForm] = useState({
    bid_amount: '',
    carrier_name: '',
    freight_charges: '',
    origin_charges: '',
    destination_charges: '',
    transit_time: '',
    validity: '',
  })

  const fetchData = useCallback(async () => {
    try {
      const res = await getRFQById(id)
      setData(res.data)
      setError(null)
    } catch {
      setError('Failed to load auction details.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleBidChange = (e) => {
    setBidForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handlePlaceBid = async (e) => {
    e.preventDefault()
    setBidError(null)
    setBidResult(null)
    const amount = parseFloat(bidForm.bid_amount)
    if (isNaN(amount) || amount <= 0) { setBidError('Enter a valid bid amount'); return }
    if (!bidForm.carrier_name.trim()) { setBidError('Carrier name is required'); return }

    try {
      setBidLoading(true)
      const res = await placeBid({
        rfq_id: parseInt(id),
        bid_amount: amount,
        carrier_name: bidForm.carrier_name,
        freight_charges: parseFloat(bidForm.freight_charges) || 0,
        origin_charges: parseFloat(bidForm.origin_charges) || 0,
        destination_charges: parseFloat(bidForm.destination_charges) || 0,
        transit_time: bidForm.transit_time,
        validity: bidForm.validity,
      })
      setBidResult(res)
      setBidForm({ bid_amount: '', carrier_name: '', freight_charges: '', origin_charges: '', destination_charges: '', transit_time: '', validity: '' })
      fetchData()
    } catch (err) {
      setBidError(err.response?.data?.message || 'Failed to place bid')
    } finally {
      setBidLoading(false)
    }
  }

  const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : '—'
  const fmtC = (a) => (a != null) ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(a) : '—'

  if (loading) return <div className="container animate-fade"><div className="skeleton" style={{ height: 400 }} /></div>
  if (error || !data) return <div className="container animate-fade"><div className="error-page"><h2>Error</h2><p>{error || 'Not found'}</p><Link to="/">← Back</Link></div></div>

  const { rfq, auction_config, rankings, activity_log } = data
  const isActive = rfq.status === 'Active'

  return (
    <div className="container animate-fade">
      <div className="breadcrumb">
        <Link to="/">Auctions</Link>
        <span className="bc-sep">›</span>
        <span>RFQ-{String(rfq.id).padStart(4, '0')}</span>
      </div>

      <div className="detail-header">
        <div>
          <div className="detail-id-row">
            <span className="detail-rfq-id">RFQ-{String(rfq.id).padStart(4, '0')}</span>
            <StatusBadge status={rfq.status} />
          </div>
          <h1 className="detail-name">{rfq.name}</h1>
        </div>
      </div>

      <div className="stats-bar">
        <div className="stats-item">
          <span className="stats-label">Lowest Bid</span>
          <span className="stats-value green">{rankings.length > 0 ? fmtC(rankings[0].bid_amount) : '—'}</span>
        </div>
        <div className="stats-divider" />
        <div className="stats-item">
          <span className="stats-label">Total Bids</span>
          <span className="stats-value">{rankings.length}</span>
        </div>
        <div className="stats-divider" />
        <div className="stats-item">
          <span className="stats-label">Close Time</span>
          <span className="stats-value">{fmt(rfq.bid_close_time)}</span>
        </div>
        <div className="stats-divider" />
        <div className="stats-item">
          <span className="stats-label">Forced Close</span>
          <span className="stats-value">{fmt(rfq.forced_close_time)}</span>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          <div className="detail-tabs">
            {['rankings', 'activity', 'config'].map(t => (
              <button key={t} className={`detail-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
                {t === 'rankings' ? `Rankings (${rankings.length})` : t === 'activity' ? `Activity (${activity_log?.length || 0})` : 'Config'}
              </button>
            ))}
          </div>

          {activeTab === 'rankings' && (
            <div className="tab-content animate-fade">
              {rankings.length === 0 ? <div className="empty-tab"><p>No bids yet</p></div> : (
                <div className="rankings-list">
                  {rankings.map((r, i) => (
                    <div key={r.bid_id} className={`ranking-card ${i === 0 ? 'l1-card' : ''}`}>
                      <div className="ranking-row" onClick={() => setExpandedBid(expandedBid === r.bid_id ? null : r.bid_id)}>
                        <span className={`rank-badge ${i < 3 ? `rank-l${i + 1}` : ''}`}>{r.rank}</span>
                        <div className="ranking-main">
                          <span className="ranking-carrier">{r.carrier_name || 'Unknown Carrier'}</span>
                          <span className="ranking-time">{fmt(r.placed_at)}</span>
                        </div>
                        <span className="ranking-amount">{fmtC(r.bid_amount)}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`expand-icon ${expandedBid === r.bid_id ? 'expanded' : ''}`}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                      {expandedBid === r.bid_id && (
                        <div className="ranking-details animate-fade">
                          <div className="detail-row">
                            <span className="detail-label">Freight Charges</span>
                            <span className="detail-val">{fmtC(r.freight_charges)}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Origin Charges</span>
                            <span className="detail-val">{fmtC(r.origin_charges)}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Destination Charges</span>
                            <span className="detail-val">{fmtC(r.destination_charges)}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Transit Time</span>
                            <span className="detail-val">{r.transit_time || '—'}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Quote Validity</span>
                            <span className="detail-val">{r.validity || '—'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="tab-content animate-fade">
              {(!activity_log || activity_log.length === 0) ? <div className="empty-tab"><p>No extensions yet</p></div> : (
                <div className="activity-list">
                  {activity_log.map((log, i) => (
                    <div key={i} className="activity-item">
                      <div className="activity-dot" />
                      <div className="activity-content">
                        <div className="activity-action">{log.action}</div>
                        <div className="activity-times">
                          <span>{fmt(log.old_close_time)}</span> → <span className="new-time">{fmt(log.new_close_time)}</span>
                        </div>
                        <span className="activity-when">{fmt(log.changed_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'config' && (
            <div className="tab-content animate-fade">
              <div className="config-grid">
                {[
                  ['Trigger Window', `${auction_config.trigger_window} min`],
                  ['Extension Duration', `${auction_config.extension_duration} min`],
                  ['Trigger Type', auction_config.trigger_type?.replace(/_/g, ' ')],
                  ['Bid Start', fmt(rfq.bid_start_time)],
                  ['Current Close', fmt(rfq.bid_close_time)],
                  ['Forced Close', fmt(rfq.forced_close_time)],
                ].map(([l, v]) => (
                  <div key={l} className="config-item"><span className="config-label">{l}</span><span className="config-value">{v}</span></div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="detail-sidebar">
          <div className="bid-card">
            <h3 className="bid-card-title">Submit Quote</h3>
            {!isActive ? (
              <div className="bid-closed">Auction is {rfq.status?.toLowerCase()}</div>
            ) : (
              <form onSubmit={handlePlaceBid} className="bid-form">
                <div className="bid-field">
                  <label>Carrier Name *</label>
                  <input type="text" name="carrier_name" value={bidForm.carrier_name} onChange={handleBidChange} placeholder="e.g., BlueDart Logistics" required />
                </div>
                <div className="bid-field">
                  <label>Bid Amount (Total) *</label>
                  <div className="bid-input-group">
                    {/* <span className="bid-currency">₹</span> */}
                    <input type="number" name="bid_amount" value={bidForm.bid_amount} onChange={handleBidChange} placeholder="Total amount" min="1" step="any" required className="bid-input" id="bid-amount-input" />
                  </div>
                </div>
                <div className="bid-field-row">
                  <div className="bid-field">
                    <label>Freight Charges</label>
                    <input type="number" name="freight_charges" value={bidForm.freight_charges} onChange={handleBidChange} placeholder="₹ 0" min="0" step="any" />
                  </div>
                  <div className="bid-field">
                    <label>Origin Charges</label>
                    <input type="number" name="origin_charges" value={bidForm.origin_charges} onChange={handleBidChange} placeholder="₹ 0" min="0" step="any" />
                  </div>
                </div>
                <div className="bid-field-row">
                  <div className="bid-field">
                    <label>Dest. Charges</label>
                    <input type="number" name="destination_charges" value={bidForm.destination_charges} onChange={handleBidChange} placeholder="₹ 0" min="0" step="any" />
                  </div>
                  <div className="bid-field">
                    <label>Transit Time</label>
                    <input type="text" name="transit_time" value={bidForm.transit_time} onChange={handleBidChange} placeholder="e.g., 3 days" />
                  </div>
                </div>
                <div className="bid-field">
                  <label>Quote Validity</label>
                  <input type="text" name="validity" value={bidForm.validity} onChange={handleBidChange} placeholder="e.g., 7 days" />
                </div>

                {rankings.length > 0 && <p className="bid-hint">Current L1: {fmtC(rankings[0].bid_amount)} ({rankings[0].carrier_name || 'Unknown'})</p>}

                <button type="submit" className="bid-submit" disabled={bidLoading} id="place-bid-btn">
                  {bidLoading ? 'Submitting...' : 'Submit Quote'}
                </button>
              </form>
            )}
            {bidResult && (
              <div className={`bid-result ${bidResult.data?.extension?.extended ? 'bid-extended' : 'bid-success'}`}>
                <strong>{bidResult.message}</strong>
                {bidResult.data?.bid && <div>Rank: <strong>{bidResult.data.bid.rank}</strong> {bidResult.data.bid.is_l1 && '🏆 L1'}</div>}
                {bidResult.data?.extension?.extended && <div className="bid-ext-reason">⏱ {bidResult.data.extension.reason}</div>}
              </div>
            )}
            {bidError && <div className="bid-error-msg">{bidError}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuctionDetailPage
