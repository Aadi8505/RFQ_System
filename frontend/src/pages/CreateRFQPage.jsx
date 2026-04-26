import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createRFQ } from '../services/api'
import './CreateRFQPage.css'

function CreateRFQPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [timeFormat, setTimeFormat] = useState('relative') // 'relative' or 'absolute'

  const [form, setForm] = useState({
    name: '',
    start_minutes_from_now: 0,
    close_minutes_from_now: 10,
    forced_close_minutes_from_now: 30,
    bid_start_time: '',
    bid_close_time: '',
    forced_close_time: '',
    service_date: '',
    trigger_window: 5,
    extension_duration: 2,
    trigger_type: 'ANY_BID',
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({
      ...prev,
      [name]: ['name', 'service_date', 'trigger_type', 'bid_start_time', 'bid_close_time', 'forced_close_time'].includes(name) ? value : Number(value),
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    // Validation
    if (!form.name.trim()) {
      setError('RFQ Name is required')
      return
    }
    if (!form.service_date) {
      setError('Service Date is required')
      return
    }
    if (timeFormat === 'relative') {
      if (form.close_minutes_from_now <= form.start_minutes_from_now) {
        setError('Bid Close Time must be after Bid Start Time')
        return
      }
      if (form.forced_close_minutes_from_now <= form.close_minutes_from_now) {
        setError('Forced Close Time must be after Bid Close Time')
        return
      }
    } else {
      if (!form.bid_start_time || !form.bid_close_time || !form.forced_close_time) {
        setError('Please provide all absolute times')
        return
      }
      if (new Date(form.bid_close_time) <= new Date(form.bid_start_time)) {
        setError('Bid Close Time must be after Bid Start Time')
        return
      }
      if (new Date(form.forced_close_time) <= new Date(form.bid_close_time)) {
        setError('Forced Close Time must be after Bid Close Time')
        return
      }
    }

    try {
      setLoading(true)
      const payload = {
        name: form.name,
        service_date: `${form.service_date}T12:00:00`,
        trigger_window: form.trigger_window,
        extension_duration: form.extension_duration,
        trigger_type: form.trigger_type,
      }
      
      if (timeFormat === 'relative') {
        payload.start_minutes_from_now = form.start_minutes_from_now
        payload.close_minutes_from_now = form.close_minutes_from_now
        payload.forced_close_minutes_from_now = form.forced_close_minutes_from_now
      } else {
        payload.bid_start_time = new Date(form.bid_start_time).toISOString()
        payload.bid_close_time = new Date(form.bid_close_time).toISOString()
        payload.forced_close_time = new Date(form.forced_close_time).toISOString()
      }
      const res = await createRFQ(payload)
      if (res.success) {
        navigate(`/rfq/${res.data.id}`)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create RFQ')
    } finally {
      setLoading(false)
    }
  }

  const triggerDescriptions = {
    ANY_BID: 'Auction extends when any bid is received in the trigger window.',
    ANY_RANK_CHANGE: 'Auction extends when any supplier ranking changes in the trigger window.',
    L1_CHANGE: 'Auction extends only when the lowest bidder (L1) changes in the trigger window.',
  }

  return (
    <div className="container animate-fade">
      <div className="create-page">
        <div className="create-header">
          <h1>Create New RFQ</h1>
          <p className="create-subtitle">Set up a British Auction with configurable extension rules</p>
        </div>

        <form onSubmit={handleSubmit} className="create-form" id="create-rfq-form">
          {error && (
            <div className="form-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          {/* Section: Basic Info */}
          <div className="form-section">
            <h2 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              Basic Information
            </h2>

            <div className="form-group">
              <label htmlFor="name">RFQ Name / Reference ID</label>
              <input
                type="text"
                id="name"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g., Freight Auction - Mumbai to Delhi"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="service_date">Pickup / Service Date</label>
              <input
                type="date"
                id="service_date"
                name="service_date"
                value={form.service_date}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          {/* Section: Timing */}
          <div className="form-section">
            <h2 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              Auction Timing
            </h2>
            <div className="time-format-toggle">
              <label className={timeFormat === 'relative' ? 'active' : ''}>
                <input 
                  type="radio" 
                  name="timeFormat" 
                  value="relative" 
                  checked={timeFormat === 'relative'} 
                  onChange={() => setTimeFormat('relative')} 
                />
                Minutes from now
              </label>
              <label className={timeFormat === 'absolute' ? 'active' : ''}>
                <input 
                  type="radio" 
                  name="timeFormat" 
                  value="absolute" 
                  checked={timeFormat === 'absolute'} 
                  onChange={() => setTimeFormat('absolute')} 
                />
                Set absolute time
              </label>
            </div>

            <p className="section-desc">
              {timeFormat === 'relative' 
                ? 'Times are relative to now. Enter minutes from the current time.' 
                : 'Select the exact date and time for each event.'}
            </p>

            <div className="form-row">
              {timeFormat === 'relative' ? (
                <>
                  <div className="form-group">
                    <label htmlFor="start_minutes_from_now">Bid Start (min from now)</label>
                    <input
                      type="number"
                      id="start_minutes_from_now"
                      name="start_minutes_from_now"
                      value={form.start_minutes_from_now}
                      onChange={handleChange}
                      min="0"
                      step="1"
                      required
                    />
                    <span className="form-hint">0 = starts immediately</span>
                  </div>
                  <div className="form-group">
                    <label htmlFor="close_minutes_from_now">Bid Close (min from now)</label>
                    <input
                      type="number"
                      id="close_minutes_from_now"
                      name="close_minutes_from_now"
                      value={form.close_minutes_from_now}
                      onChange={handleChange}
                      min="1"
                      step="1"
                      required
                    />
                    <span className="form-hint">When auction normally ends</span>
                  </div>
                  <div className="form-group">
                    <label htmlFor="forced_close_minutes_from_now">Forced Close (min from now)</label>
                    <input
                      type="number"
                      id="forced_close_minutes_from_now"
                      name="forced_close_minutes_from_now"
                      value={form.forced_close_minutes_from_now}
                      onChange={handleChange}
                      min="2"
                      step="1"
                      required
                    />
                    <span className="form-hint">Absolute max — no extensions past this</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label htmlFor="bid_start_time">Bid Start Time</label>
                    <input
                      type="datetime-local"
                      id="bid_start_time"
                      name="bid_start_time"
                      value={form.bid_start_time}
                      onChange={handleChange}
                      required
                    />
                    <span className="form-hint">When the auction opens</span>
                  </div>
                  <div className="form-group">
                    <label htmlFor="bid_close_time">Bid Close Time</label>
                    <input
                      type="datetime-local"
                      id="bid_close_time"
                      name="bid_close_time"
                      value={form.bid_close_time}
                      onChange={handleChange}
                      required
                    />
                    <span className="form-hint">When auction normally ends</span>
                  </div>
                  <div className="form-group">
                    <label htmlFor="forced_close_time">Forced Close Time</label>
                    <input
                      type="datetime-local"
                      id="forced_close_time"
                      name="forced_close_time"
                      value={form.forced_close_time}
                      onChange={handleChange}
                      required
                    />
                    <span className="form-hint">Absolute max — no extensions past this</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section: British Auction Config */}
          <div className="form-section">
            <h2 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              British Auction Configuration
            </h2>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label htmlFor="trigger_window">Trigger Window (X minutes)</label>
                <input
                  type="number"
                  id="trigger_window"
                  name="trigger_window"
                  value={form.trigger_window}
                  onChange={handleChange}
                  min="1"
                  max="60"
                  step="1"
                  required
                />
                <span className="form-hint">Monitor activity this many minutes before close</span>
              </div>
              <div className="form-group">
                <label htmlFor="extension_duration">Extension Duration (Y minutes)</label>
                <input
                  type="number"
                  id="extension_duration"
                  name="extension_duration"
                  value={form.extension_duration}
                  onChange={handleChange}
                  min="1"
                  max="30"
                  step="1"
                  required
                />
                <span className="form-hint">How much time to add when triggered</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="trigger_type">Extension Trigger</label>
              <select
                id="trigger_type"
                name="trigger_type"
                value={form.trigger_type}
                onChange={handleChange}
              >
                <option value="ANY_BID">Any Bid Received</option>
                <option value="ANY_RANK_CHANGE">Any Supplier Rank Change</option>
                <option value="L1_CHANGE">Lowest Bidder (L1) Change</option>
              </select>
              <span className="form-hint">{triggerDescriptions[form.trigger_type]}</span>
            </div>
          </div>

          {/* Preview card */}
          <div className="preview-card">
            <h3 className="preview-title">Configuration Preview</h3>
            <div className="preview-grid">
              {timeFormat === 'relative' ? (
                <>
                  <div className="preview-item">
                    <span className="preview-label">Auction starts</span>
                    <span className="preview-value">{form.start_minutes_from_now === 0 ? 'Immediately' : `In ${form.start_minutes_from_now} min`}</span>
                  </div>
                  <div className="preview-item">
                    <span className="preview-label">Normal close</span>
                    <span className="preview-value">In {form.close_minutes_from_now} min</span>
                  </div>
                  <div className="preview-item">
                    <span className="preview-label">Hard deadline</span>
                    <span className="preview-value">In {form.forced_close_minutes_from_now} min</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="preview-item">
                    <span className="preview-label">Auction starts</span>
                    <span className="preview-value">{form.bid_start_time ? new Date(form.bid_start_time).toLocaleString() : 'Not set'}</span>
                  </div>
                  <div className="preview-item">
                    <span className="preview-label">Normal close</span>
                    <span className="preview-value">{form.bid_close_time ? new Date(form.bid_close_time).toLocaleString() : 'Not set'}</span>
                  </div>
                  <div className="preview-item">
                    <span className="preview-label">Hard deadline</span>
                    <span className="preview-value">{form.forced_close_time ? new Date(form.forced_close_time).toLocaleString() : 'Not set'}</span>
                  </div>
                </>
              )}
              <div className="preview-item">
                <span className="preview-label">Monitoring window</span>
                <span className="preview-value">Last {form.trigger_window} min before close</span>
              </div>
              <div className="preview-item">
                <span className="preview-label">Extension amount</span>
                <span className="preview-value">+{form.extension_duration} min per trigger</span>
              </div>
              <div className="preview-item">
                <span className="preview-label">Trigger condition</span>
                <span className="preview-value">{form.trigger_type.replace(/_/g, ' ')}</span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="submit-btn"
            disabled={loading}
            id="submit-rfq-btn"
          >
            {loading ? (
              <>
                <span className="spinner" />
                Creating...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Create Auction
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default CreateRFQPage
