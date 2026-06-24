import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App'

export default function Login() {
  const { signIn } = useAuth()
  const navigate   = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await signIn(form.email, form.password)
      navigate('/')
    } catch(err) {
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-wrap">
        <div className="login-left">
          <div className="login-tag">SA'DA H2O Platform</div>
          <div className="login-h">Reach every customer,<br/>every occasion.</div>
          <div className="login-p">Bulk SMS campaigns, bilingual templates, and contact management — all in one private tool.</div>
          <div className="login-feat">
            {[
              '10 pre-loaded Saudi occasion templates',
              'Bilingual AR + EN campaigns',
              'Bulk import thousands of contacts',
              'Live delivery reports per campaign',
              'Sender ID: SADA.Co-AD',
            ].map(f => (
              <div key={f} className="login-feat-item">
                <div className="login-dot"/>{f}
              </div>
            ))}
          </div>
        </div>
        <div className="login-right">
          <div className="login-icon"><i className="ti ti-droplet"/></div>
          <div className="login-title">Sign in</div>
          <div className="login-sub">SA'DA H2O · SMS Platform</div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 14 }}>
              <i className="ti ti-alert-circle"/>{error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email}
                onChange={e => setForm({...form, email: e.target.value})}
                placeholder="you@example.com" required autoFocus/>
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" value={form.password}
                onChange={e => setForm({...form, password: e.target.value})}
                placeholder="••••••••" required/>
            </div>
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? <span className="spinner"/> : 'Sign in'}
            </button>
          </form>
          <div className="login-hint">Private access only · Powered by Taqnyat</div>
        </div>
      </div>
    </div>
  )
}
