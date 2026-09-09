import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'
import Modal from '../components/Modal'

const TYPES = ['All','Customer','Lead','VIP','Prospect']
const fmtD  = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'
const fmt   = n => Number(n||0).toLocaleString()

function normMobile(m) {
  let n = String(m).replace(/\D/g,'')
  if (n.startsWith('00966')) n = n.slice(2)
  if (n.startsWith('0'))     n = '966' + n.slice(1)
  if (!n.startsWith('966'))  n = '966' + n
  return n
}

function parseLines(text) {
  const lines = text.trim().split('\n').filter(Boolean)
  const rows = []
  lines.forEach((line, i) => {
    if (i === 0 && /name/i.test(line.split(/[|,\t]/)[0])) return
    const sep   = line.includes('\t') ? '\t' : line.includes('|') ? '|' : ','
    const parts = line.split(sep).map(s => s.trim())
    if (parts.length >= 2 && parts[1]) {
      rows.push({ name: parts[0]||'', mobile: parts[1]||'', city: parts[2]||'', type: parts[3]||'Lead', notes: parts[4]||'' })
    }
  })
  return rows
}

export default function Contacts() {
  const [contacts, setContacts] = useState([])
  const [stats, setStats]       = useState({})
  const [filter, setFilter]     = useState('All')
  const [search, setSearch]     = useState('')
  const [city, setCity]         = useState('')
  const [modal, setModal]       = useState(null)
  const [importTab, setImportTab] = useState('paste')
  const [importText, setImportText] = useState('')
  const [importRows, setImportRows] = useState([])
  const [addForm, setAddForm]   = useState({ name:'', mobile:'', city:'', type:'Customer', notes:'' })
  const [loading, setLoading]   = useState(false)
  const [alert, setAlert]       = useState(null)

  const load = useCallback(async () => {
    let q = supabase.from('contacts').select('*').order('created_at', { ascending: false })
    if (filter !== 'All' && filter !== 'opt_out') q = q.eq('type', filter)
    if (filter === 'opt_out') q = q.eq('opt_out', true)
    if (search) q = q.or(`name.ilike.%${search}%,mobile.ilike.%${search}%`)
    if (city)   q = q.eq('city', city)
    const { data } = await q
    setContacts(data || [])

    const all = (await supabase.from('contacts').select('type, opt_out')).data || []
    setStats({
      total:     all.length,
      customers: all.filter(c=>c.type==='Customer').length,
      leads:     all.filter(c=>c.type==='Lead').length,
      vip:       all.filter(c=>c.type==='VIP').length,
      opted_out: all.filter(c=>c.opt_out).length,
    })
  }, [filter, search, city])

  useEffect(() => { load() }, [load])

  const tabLabel = t => {
    const counts = { All: stats.total, Customer: stats.customers, Lead: stats.leads, VIP: stats.vip, opt_out: stats.opted_out }
    return `${t === 'opt_out' ? 'Opted out' : t} (${fmt(counts[t] || 0)})`
  }

  async function addOne() {
    if (!addForm.mobile) { setAlert({ type:'error', msg:'Mobile is required' }); return }
    setLoading(true)
    const mobile = normMobile(addForm.mobile)
    const { error } = await supabase.from('contacts').insert({ ...addForm, mobile, opt_out: false })
    if (error) setAlert({ type:'error', msg: error.code === '23505' ? 'This number already exists.' : error.message })
    else { setModal(null); load() }
    setLoading(false)
  }

  async function doImport() {
    const rows = importTab === 'paste' ? importRows : importRows
    if (!rows.length) { setAlert({ type:'error', msg:'No valid rows found' }); return }
    setLoading(true); setAlert(null)
    const inserts = rows.map(r => ({ ...r, mobile: normMobile(r.mobile), opt_out: false }))
    const { data, error } = await supabase.from('contacts').upsert(inserts, { onConflict: 'mobile', ignoreDuplicates: true })
    if (error) setAlert({ type:'error', msg: error.message })
    else {
      setAlert({ type:'success', msg: `Import complete. ${inserts.length} rows processed.` })
      load()
      setTimeout(() => setModal(null), 1800)
    }
    setLoading(false)
  }

  async function del(id) {
    if (!confirm('Delete this contact?')) return
    await supabase.from('contacts').delete().eq('id', id)
    load()
  }

  async function optOut(id) {
    if (!confirm('Mark as opted out? They will be excluded from all future campaigns.')) return
    await supabase.from('contacts').update({ opt_out: true }).eq('id', id)
    load()
  }

  function typeBadge(t) {
    const cls = { Customer:'badge-teal', Lead:'badge-gray', VIP:'badge-gold', Prospect:'badge-gray' }
    return <span className={`badge ${cls[t]||'badge-gray'}`}>{t}</span>
  }

  return (
    <div>
      <div className="subnav">
        {['All','Customer','Lead','VIP','opt_out'].map(t => (
          <button key={t} className={`subnav-tab ${filter===t?'active':''}`} onClick={() => setFilter(t)}>
            {tabLabel(t)}
          </button>
        ))}
      </div>

      <div className="page-content">
        {alert && <div className={`alert alert-${alert.type}`}><i className={`ti ti-${alert.type==='error'?'alert-circle':'circle-check'}`}/>{alert.msg}</div>}

        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:14,flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:180,position:'relative'}}>
            <i className="ti ti-search" style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',fontSize:14,color:'var(--ink-3)',pointerEvents:'none'}}/>
            <input style={{width:'100%',padding:'7px 10px 7px 30px',border:'1px solid var(--border-2)',borderRadius:'var(--r)',background:'var(--surface)',fontSize:12.5}}
              placeholder="Search name or number…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <select className="form-select" style={{width:130}} value={city} onChange={e=>setCity(e.target.value)}>
            <option value="">All cities</option>
            {['Dammam','Al Khobar','Jubail','Dhahran','Riyadh','Jeddah'].map(c=><option key={c}>{c}</option>)}
          </select>
          <button className="btn btn-sm" onClick={() => setModal('import')}><i className="ti ti-upload"/>Import</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setAddForm({name:'',mobile:'',city:'',type:'Customer',notes:''}); setAlert(null); setModal('add') }}>
            <i className="ti ti-plus"/>Add contact
          </button>
        </div>

        <div className="card" style={{padding:0}}>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Name</th><th>Mobile</th><th>City</th><th>Type</th><th>Status</th><th>Added</th><th></th></tr></thead>
              <tbody>
                {contacts.length === 0
                  ? <tr><td colSpan={7}><div className="empty-state"><i className="ti ti-users"/><p>No contacts found.</p></div></td></tr>
                  : contacts.map(c => (
                  <tr key={c.id}>
                    <td style={{fontWeight:600}}>{c.name||'—'}</td>
                    <td style={{fontFamily:'var(--mono)',fontSize:11.5,color:'var(--ink-2)'}}>{c.mobile}</td>
                    <td style={{color:'var(--ink-2)'}}>{c.city||'—'}</td>
                    <td>{typeBadge(c.type)}</td>
                    <td>{c.opt_out?<span className="badge badge-red">Opted out</span>:<span className="badge badge-green">Active</span>}</td>
                    <td style={{color:'var(--ink-3)',fontSize:11}}>{fmtD(c.created_at)}</td>
                    <td>
                      <div style={{display:'flex',gap:4}}>
                        {!c.opt_out && <button className="btn btn-ghost btn-sm" style={{fontSize:10.5}} onClick={()=>optOut(c.id)}>Opt-out</button>}
                        <button className="btn btn-ghost btn-sm" style={{padding:'3px 7px'}} onClick={()=>del(c.id)}><i className="ti ti-trash" style={{fontSize:11}}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager"><span>Showing {fmt(contacts.length)} contacts</span></div>
        </div>
      </div>

      {/* Add modal */}
      {modal === 'add' && (
        <Modal title="Add contact" onClose={() => setModal(null)}>
          {alert && <div className={`alert alert-${alert.type}`}><i className="ti ti-alert-circle"/>{alert.msg}</div>}
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={addForm.name} onChange={e=>setAddForm({...addForm,name:e.target.value})} placeholder="Full name"/></div>
            <div className="form-group"><label className="form-label">Mobile</label><input className="form-input" value={addForm.mobile} onChange={e=>setAddForm({...addForm,mobile:e.target.value})} placeholder="05XXXXXXXX"/></div>
            <div className="form-group"><label className="form-label">City</label><input className="form-input" value={addForm.city} onChange={e=>setAddForm({...addForm,city:e.target.value})} placeholder="Dammam"/></div>
            <div className="form-group"><label className="form-label">Type</label>
              <select className="form-select" value={addForm.type} onChange={e=>setAddForm({...addForm,type:e.target.value})}>
                {['Customer','Lead','VIP','Prospect'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group"><label className="form-label">Notes (optional)</label><input className="form-input" value={addForm.notes} onChange={e=>setAddForm({...addForm,notes:e.target.value})} placeholder="e.g. RO unit installed"/></div>
          <div className="modal-footer">
            <button className="btn" onClick={()=>setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={addOne} disabled={loading}>{loading?<span className="spinner"/>:'Add contact'}</button>
          </div>
        </Modal>
      )}

      {/* Import modal */}
      {modal === 'import' && (
        <Modal title="Import contacts" wide onClose={() => { setModal(null); setImportText(''); setImportRows([]); setAlert(null) }}>
          {alert && <div className={`alert alert-${alert.type}`}><i className={`ti ti-${alert.type==='error'?'alert-circle':'circle-check'}`}/>{alert.msg}</div>}
          <div className="import-tabs">
            <div className={`import-tab ${importTab==='paste'?'active':''}`} onClick={()=>setImportTab('paste')}>
              <i className="ti ti-clipboard"/><div className="import-tab-name">Paste text</div><div className="import-tab-sub">From Excel or clipboard</div>
            </div>
            <div className={`import-tab ${importTab==='file'?'active':''}`} onClick={()=>setImportTab('file')}>
              <i className="ti ti-file-spreadsheet"/><div className="import-tab-name">Upload CSV</div><div className="import-tab-sub">Upload .csv file</div>
            </div>
          </div>
          <div className="code-hint">Name | Mobile | City | Type | Notes<br/>Mohammed | 0501234567 | Dammam | Customer | RO unit<br/>Sara | 0551234567 | Al Khobar | Lead |</div>
          {importTab === 'paste'
            ? <div className="form-group">
                <textarea className="form-textarea" style={{minHeight:100,fontFamily:'var(--mono)',fontSize:11.5}} placeholder="Paste contacts here — one per line…"
                  value={importText} onChange={e => { setImportText(e.target.value); setImportRows(parseLines(e.target.value)) }}/>
              </div>
            : <div className="form-group">
                <input type="file" accept=".csv" className="form-input" style={{padding:6}}
                  onChange={async e => { const t = await e.target.files[0]?.text(); if(t){ setImportText(t); setImportRows(parseLines(t)) } }}/>
              </div>
          }
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--ink-3)',marginBottom:14}}>
            <span>{importRows.length} rows detected</span>
            <span>Duplicates skipped · Opted-out excluded on send</span>
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={()=>setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={doImport} disabled={loading||!importRows.length}>
              {loading?<span className="spinner"/>:`Import ${importRows.length} contacts`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
