import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../App'
import Modal from '../components/Modal'

const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'

export default function Users() {
  const { user } = useAuth()
  const [users, setUsers]   = useState([])
  const [modal, setModal]   = useState(null)
  const [form, setForm]     = useState({ email:'', password:'', full_name:'', role:'staff' })
  const [alert, setAlert]   = useState(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setUsers(data || [])
  }
  useEffect(() => { load() }, [])

  async function createUser() {
    if (!form.email || !form.password) { setAlert({ type:'error', msg:'Email and password required' }); return }
    if (form.password.length < 8) { setAlert({ type:'error', msg:'Password must be at least 8 characters' }); return }
    setSaving(true); setAlert(null)
    try {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setModal(null); load()
    } catch(e) { setAlert({ type:'error', msg: e.message }) }
    finally { setSaving(false) }
  }

  async function deactivate(uid, email) {
    if (!confirm(`Remove ${email}? They will no longer be able to sign in.`)) return
    await supabase.from('profiles').update({ active: false }).eq('id', uid)
    load()
  }

  return (
    <div className="page-content">
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:14}}>
        <button className="btn btn-primary btn-sm" onClick={() => { setForm({email:'',password:'',full_name:'',role:'staff'}); setAlert(null); setModal('add') }}>
          <i className="ti ti-user-plus"/>Add user
        </button>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{fontWeight:600}}>
                  {u.full_name || '—'}
                  {u.id === user.id && <span className="badge badge-teal" style={{marginLeft:6}}>You</span>}
                </td>
                <td style={{color:'var(--ink-2)'}}>{u.email}</td>
                <td><span className={`badge ${u.role==='admin'?'badge-gold':'badge-gray'}`}>{u.role}</span></td>
                <td>{u.active!==false?<span className="badge badge-green">Active</span>:<span className="badge badge-red">Inactive</span>}</td>
                <td style={{color:'var(--ink-3)',fontSize:11}}>{fmtD(u.created_at)}</td>
                <td>
                  {u.id !== user.id && u.active !== false && (
                    <button className="btn btn-danger btn-sm" onClick={() => deactivate(u.id, u.email)}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal === 'add' && (
        <Modal title="Add user" onClose={() => setModal(null)}>
          {alert && <div className={`alert alert-${alert.type}`}><i className="ti ti-alert-circle"/>{alert.msg}</div>}
          <div className="form-group"><label className="form-label">Full name</label><input className="form-input" value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} placeholder="e.g. Sara Al-Dosari"/></div>
          <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="sara@example.com"/></div>
          <div className="form-group"><label className="form-label">Password</label><input className="form-input" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Min. 8 characters"/></div>
          <div className="form-group"><label className="form-label">Role</label>
            <select className="form-select" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
              <option value="staff">Staff — can send campaigns and view reports</option>
              <option value="admin">Admin — full access including user management</option>
            </select>
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={createUser} disabled={saving}>{saving?<span className="spinner"/>:'Create user'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
