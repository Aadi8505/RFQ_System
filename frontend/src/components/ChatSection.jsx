import { useState, useEffect, useRef } from 'react'
import { getMessages, sendMessage, closeChat } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { io } from 'socket.io-client'
import './ChatSection.css'

export default function ChatSection({ rfqId, auctionStatus, posterId, rankings, bidCloseTime, forcedCloseTime }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [partner, setPartner] = useState(null)
  const [myRole, setMyRole] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [timeLeft, setTimeLeft] = useState('')
  const [isClosingChat, setIsClosingChat] = useState(false)
  const messagesEndRef = useRef(null)

  // Determine if chat should be shown
  const isClosed = auctionStatus === 'Closed' || auctionStatus === 'Force Closed'
  const winnerId = rankings?.length > 0 ? rankings[0].user_id : null
  const isParticipant = user?.id === posterId || user?.id === winnerId
  const showChat = isClosed && winnerId && isParticipant

  useEffect(() => {
    if (!showChat) return
    fetchMessages()

    const socketUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
    const socket = io(socketUrl, {
      withCredentials: true
    })

    socket.emit('join-room', `rfq-${rfqId}-chat`)

    socket.on('message-received', (msg) => {
      //console.log('Real-time message:', msg)
      setMessages((prev) => {
        if (prev.some(m => m.id === msg.id)) return prev
        const tempIndex = prev.findIndex(m => m.id.toString().startsWith('temp-') && m.content === msg.content)
        if (tempIndex !== -1) {
          const updated = [...prev]
          updated[tempIndex] = msg
          return updated
        }
        return [...prev, msg]
      })
    })

    socket.on('chat-closed', () => {
      //console.log('Real-time chat-closed event received')
      setError('Chat has been closed by the service poster.')
    })

    return () => {
      socket.emit('leave-room', `rfq-${rfqId}-chat`)
      socket.disconnect()
    }
  }, [showChat, rfqId])

  useEffect(() => {
    if (!showChat) return
    if (error && (error.includes('closed') || error.includes('expired'))) {
      setTimeLeft('')
      return
    }
    const closeTimeStr = forcedCloseTime || bidCloseTime
    if (!closeTimeStr) return

    const closeTime = new Date(closeTimeStr)
    const expiryTime = new Date(closeTime.getTime() + 30 * 60 * 1000)

    const updateTimer = () => {
      if (error && (error.includes('closed') || error.includes('expired'))) {
        setTimeLeft('')
        return
      }
      const diff = expiryTime.getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft('Expired')
        setError('Chat has expired (chat sessions are limited to 30 minutes post-auction).')
      } else {
        const mins = Math.floor(diff / 60000)
        const secs = Math.floor((diff % 60000) / 1000)
        setTimeLeft(`${mins}m ${secs}s remaining`)
      }
    }

    updateTimer()
    const timerInterval = setInterval(updateTimer, 1000)
    return () => clearInterval(timerInterval)
  }, [showChat, bidCloseTime, forcedCloseTime, error])

  const handleManualClose = async () => {
    if (!window.confirm('Are you sure you want to manually close this chat? This action is permanent.')) return
    setIsClosingChat(true)
    try {
      await closeChat(rfqId)
      setError('Chat has been closed by the service poster.')
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to close chat.')
    } finally {
      setIsClosingChat(false)
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const fetchMessages = async () => {
    try {
      const data = await getMessages(rfqId)
      if (data.success) {
        setMessages(data.data.messages)
        setPartner(data.data.partner)
        setMyRole(data.data.my_role)
        if (data.data.chat_closed) {
          setError(data.data.closed_reason)
        } else {
          setError('')
        }
      }
      setLoading(false)
    } catch (err) {
      if (err.response?.status === 403) {
        setError(err.response.data.message)
      }
      setLoading(false)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSend = async (e) => {
    e.preventDefault()
    const text = newMessage.trim()
    if (!text || sending) return

    const tempId = `temp-${Date.now()}`
    const optimisticMessage = {
      id: tempId,
      rfq_id: rfqId,
      sender_id: user.id,
      sender_name: user.name,
      sender_avatar: user.avatar_url,
      content: text,
      created_at: new Date().toISOString(),
      sending: true
    }

    setMessages((prev) => [...prev, optimisticMessage])
    setNewMessage('')
    setSending(true)

    try {
      const data = await sendMessage(rfqId, text)
      if (data.success) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? data.data : m))
        )
      }
    } catch (err) {
      //console.error('Failed to send message:', err)
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, failed: true, sending: false } : m))
      )
    }
    setSending(false)
  }

  // Don't render if conditions aren't met
  if (!isClosed) return null
  if (!winnerId) return null
  if (!isParticipant) return null

  if (loading) return <div className="chat-loading">Loading chat...</div>

  return (
    <div className="chat-section">
      <div className="chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--accent)', flexShrink: 0}}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Chat with {partner?.name || 'User'}
          </h3>
          <span className="chat-role">
            You are the {myRole === 'poster' ? 'Service Poster' : 'Winning Bidder'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {timeLeft && (
            <span className="chat-timer" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--amber)', background: 'var(--amber-bg)', padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              ⏱ {timeLeft}
            </span>
          )}
          {myRole === 'poster' && (
            <button onClick={handleManualClose} disabled={isClosingChat} className="chat-close-action-btn">
              {isClosingChat ? 'Closing...' : 'Close Chat'}
            </button>
          )}
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-message ${msg.sender_id === user.id ? 'sent' : 'received'}`}
            >
              <div className="message-bubble">
                <div className="message-sender">
                  {msg.sender_avatar && (
                    <img src={msg.sender_avatar} alt="" className="message-avatar" />
                  )}
                  <span className="message-name">{msg.sender_name}</span>
                  <span className="message-time">
                    {msg.sending ? 'sending...' : msg.failed ? 'failed' : new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="message-content">{msg.content}</p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {error ? (
        <div className="chat-closed-banner" style={{ padding: '16px 20px', textAlign: 'center', background: 'rgba(239, 68, 68, 0.06)', borderTop: '1px solid var(--border-subtle)', color: 'var(--red)', fontSize: '13px', fontWeight: 600 }}>
          🔒 {error}
        </div>
      ) : (
        <form className="chat-input-form" onSubmit={handleSend}>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            maxLength={2000}
            className="chat-input"
          />
          <button type="submit" className="chat-send-btn" disabled={sending || !newMessage.trim()}>
            {sending ? '...' : 'Send'}
          </button>
        </form>
      )}
    </div>
  )
}
