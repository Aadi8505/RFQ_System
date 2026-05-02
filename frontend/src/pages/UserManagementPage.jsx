import { useState, useEffect, useCallback } from 'react'
import { getUsers, createUser, updateUser, deleteUser } from '../services/api'
import './UserManagementPage.css'

const EMPTY_FORM = { name: '', email: '', password: '', role: 'user' }

function UserManagementPage() {
  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  // Modal state
  const [modal, setModal]       = useState(null) // null | 'create' | 'edit' | 'delete'
  const [selected, setSelected] = useState(null)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [formErr, setFormErr]   = useState('')
  const [saving, setSaving]     = useState(false)

  // ── Fetch all users ───────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getUsers()
      setUsers(data.users || [])
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load users.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const showSuccess = (msg) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(''), 3500)
  }

  // ── Open modal helpers ────────────────────────────────────────────────────
  const openCreate = () => {
    setForm(EMPTY_FORM)
    setFormErr('')
    setModal('create')
  }

  const openEdit = (user) => {
    setSelected(user)
    setForm({ name: user.name, email: user.email, password: '', role: user.role })
    setFormErr('')
    setModal('edit')
  }

  const openDelete = (user) => {
    setSelected(user)
    setModal('delete')
  }

  const closeModal = () => {
    setModal(null)
    setSelected(null)
    setForm(EMPTY_FORM)
    setFormErr('')
  }

  // ── Form submit ───────────────────────────────────────────────────────────
  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    setFormErr('')
    if (!form.password) { setFormErr('Password is required.'); return }
    setSaving(true)
    try {
      await createUser(form)
      closeModal()
      showSuccess(`User "${form.name}" created successfully.`)
      fetchUsers()
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Failed to create user.')
    } finally {
      setSaving(false)
    }
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    setFormErr('')
    setSaving(true)
    try {
      const payload = { name: form.name, email: form.email, role: form.role }
      if (form.password) payload.password = form.password
      await updateUser(selected.id, payload)
      closeModal()
      showSuccess(`User "${form.name}" updated successfully.`)
      fetchUsers()
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Failed to update user.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (user) => {
    try {
      await updateUser(user.id, { is_active: !user.is_active })
      showSuccess(`User "${user.name}" ${user.is_active ? 'deactivated' : 'activated'}.`)
      fetchUsers()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status.')
    }
  }

  const handleDelete = async () => {
    setSaving(true)
    try {
      await deleteUser(selected.id)
      closeModal()
      showSuccess(`User "${selected.name}" deleted.`)
      fetchUsers()
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Failed to delete user.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="ump-page">
      {/* Header */}
      <div className="ump-header">
        <div className="ump-header-left">
          <div className="ump-icon-wrap">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/>
              <path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <div>
            <h1 className="ump-title">User Management</h1>
            <p className="ump-subtitle">Manage admin and user accounts for the platform</p>
          </div>
        </div>
        <button className="ump-add-btn" onClick={openCreate} id="add-user-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add User
        </button>
      </div>

      {/* Toast messages */}
      {error   && <div className="ump-toast ump-toast-error"  role="alert">{error}</div>}
      {success && <div className="ump-toast ump-toast-success" role="status">{success}</div>}

      {/* Table */}
      <div className="ump-card">
        {loading ? (
          <div className="ump-loading">
            <div className="ump-spinner" />
            <span>Loading users…</span>
          </div>
        ) : users.length === 0 ? (
          <div className="ump-empty">No users found.</div>
        ) : (
          <div className="ump-table-wrap">
            <table className="ump-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => (
                  <tr key={u.id} className={!u.is_active ? 'ump-row-inactive' : ''}>
                    <td className="ump-td-num">{idx + 1}</td>
                    <td>
                      <div className="ump-user-cell">
                        <div className={`ump-avatar ump-avatar-${u.role}`}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <span>{u.name}</span>
                      </div>
                    </td>
                    <td className="ump-email">{u.email}</td>
                    <td>
                      <span className={`ump-role-badge ump-role-${u.role}`}>
                        {u.role === 'admin' ? (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        ) : (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        )}
                        {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                      </span>
                    </td>
                    <td>
                      <button
                        className={`ump-status-btn ${u.is_active ? 'status-active' : 'status-inactive'}`}
                        onClick={() => handleToggleActive(u)}
                        title={u.is_active ? 'Click to deactivate' : 'Click to activate'}
                      >
                        <span className="ump-status-dot" />
                        {u.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="ump-date">
                      {new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td>
                      <div className="ump-actions">
                        <button className="ump-action-btn ump-edit-btn" onClick={() => openEdit(u)} title="Edit">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button className="ump-action-btn ump-delete-btn" onClick={() => openDelete(u)} title="Delete">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="ump-modal-overlay" onClick={closeModal}>
          <div className="ump-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ump-modal-header">
              <h2>{modal === 'create' ? 'Add New User' : 'Edit User'}</h2>
              <button className="ump-modal-close" onClick={closeModal} aria-label="Close">✕</button>
            </div>

            {formErr && <div className="ump-form-error">{formErr}</div>}

            <form onSubmit={modal === 'create' ? handleCreateSubmit : handleEditSubmit} className="ump-form">
              <div className="ump-form-row">
                <div className="ump-form-field">
                  <label htmlFor="ump-name">Full Name</label>
                  <input
                    id="ump-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. John Doe"
                    required
                  />
                </div>
                <div className="ump-form-field">
                  <label htmlFor="ump-email">Email Address</label>
                  <input
                    id="ump-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="e.g. john@company.com"
                    required
                  />
                </div>
              </div>

              <div className="ump-form-row">
                <div className="ump-form-field">
                  <label htmlFor="ump-password">
                    Password {modal === 'edit' && <span className="ump-label-hint">(leave blank to keep current)</span>}
                  </label>
                  <input
                    id="ump-password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder={modal === 'edit' ? '••••••••' : 'Min 6 characters'}
                    minLength={modal === 'create' ? 6 : 0}
                    required={modal === 'create'}
                  />
                </div>
                <div className="ump-form-field">
                  <label htmlFor="ump-role">Role</label>
                  <select
                    id="ump-role"
                    value={form.role}
                    onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
                  >
                    <option value="user">User — Monitor & place bids</option>
                    <option value="admin">Admin — Create & manage auctions</option>
                  </select>
                </div>
              </div>

              <div className="ump-form-actions">
                <button type="button" className="ump-btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
                <button type="submit" className="ump-btn-primary" disabled={saving} id={`ump-${modal}-submit`}>
                  {saving ? <span className="ump-btn-spinner" /> : (modal === 'create' ? 'Create User' : 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'delete' && selected && (
        <div className="ump-modal-overlay" onClick={closeModal}>
          <div className="ump-modal ump-modal-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="ump-confirm-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h2 className="ump-confirm-title">Delete User?</h2>
            <p className="ump-confirm-msg">
              Are you sure you want to permanently delete <strong>{selected.name}</strong> ({selected.email})?
              This action cannot be undone.
            </p>
            {formErr && <div className="ump-form-error">{formErr}</div>}
            <div className="ump-form-actions ump-confirm-actions">
              <button className="ump-btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
              <button className="ump-btn-danger" onClick={handleDelete} disabled={saving} id="ump-delete-confirm-btn">
                {saving ? <span className="ump-btn-spinner" /> : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserManagementPage
