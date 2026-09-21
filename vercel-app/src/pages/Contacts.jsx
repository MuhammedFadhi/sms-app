import React, { useEffect, useState, useCallback, useRef } from 'react'
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

function applyFilters(q, { filter, search, city }) {
  if (filter !== 'All' && filter !== 'opt_out') q = q.eq('type', filter)
  if (filter === 'opt_out') q = q.eq('opt_out', true)
  if (search) q = q.or(`name.ilike.%${search}%,mobile.ilike.%${search}%`)
  if (city)   q = q.eq('city', city)
  return q
}

const csvCell = v => {
  const s = String(v ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
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
  const [report, setReport]     = useState(null)
  const [exporting, setExporting] = useState(false)
  const analyzeRun              = useRef(0)

  const load = useCallback(async () => {
    const { data } = await applyFilters(
      supabase.from('contacts').select('*').order('created_at', { ascending: false }),
      { filter, search, city }
    )
    setContacts(data || [])

    const countOf = async apply => {
      const { count } = await apply(supabase.from('contacts').select('*', { count: 'exact', head: true }))
      return count || 0
    }
    const [total, customers, leads, vip, opted_out] = await Promise.all([
      countOf(q => q),
      countOf(q => q.eq('type', 'Customer')),
      countOf(q => q.eq('type', 'Lead')),
      countOf(q => q.eq('type', 'VIP')),
      countOf(q => q.eq('opt_out', true)),
    ])
    setStats({ total, customers, leads, vip, opted_out })
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
    const { data: blocked } = await supabase.from('contacts').select('id').eq('mobile', mobile).eq('opt_out', true).limit(1)
    const { error } = await supabase.from('contacts').insert({ ...addForm, mobile, opt_out: !!blocked?.length })
    if (error) setAlert({ type:'error', msg: error.code === '23505' ? `This number is already in the ${addForm.type} list.` : error.message })
    else { setModal(null); load() }
    setLoading(false)
  }

  async function exportCsv() {
    setExporting(true); setAlert(null)
    const rows = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await applyFilters(
        supabase.from('contacts').select('*').order('created_at', { ascending: false }).order('id'),
        { filter, search, city }
      ).range(from, from + 999)
      if (error) { setAlert({ type:'error', msg: 'Export failed: ' + error.message }); setExporting(false); return }
      rows.push(...data)
      if (data.length < 1000) break
    }
    if (!rows.length) { setAlert({ type:'error', msg:'Nothing to export.' }); setExporting(false); return }

    const header = ['Name', 'Mobile', 'City', 'Type', 'Notes', 'Status', 'Added']
    const lines  = rows.map(c => [
      c.name, c.mobile, c.city, c.type, c.notes, c.opt_out ? 'Opted out' : 'Active', c.created_at ? c.created_at.slice(0, 10) : '',
    ].map(csvCell).join(','))
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `contacts-${(filter === 'opt_out' ? 'opted-out' : filter).toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
    setAlert({ type:'success', msg: `Exported ${rows.length} contacts.` })
    setExporting(false)
  }

  async function analyze(rows) {
    const run = ++analyzeRun.current
    if (!rows.length) { setReport(null); return }
    setReport({ checking: true })
    await new Promise(r => setTimeout(r, 300))
    if (run !== analyzeRun.current) return

    const seen = new Set(), unique = [], fileDupes = []
    rows.forEach(r => {
      const mobile = normMobile(r.mobile)
      const key = `${mobile}|${r.type}`
      if (seen.has(key)) fileDupes.push({ ...r, mobile })
      else { seen.add(key); unique.push({ ...r, mobile }) }
    })

    const existingByKey = new Map(), knownMobiles = new Set(), optedOut = new Set()
    const mobiles = [...new Set(unique.map(r => r.mobile))]
    for (let i = 0; i < mobiles.length; i += 200) {
      const { data, error } = await supabase.from('contacts').select('mobile, type, name, opt_out').in('mobile', mobiles.slice(i, i + 200))
      if (run !== analyzeRun.current) return
      if (error) { setReport(null); setAlert({ type:'error', msg: 'Could not check for duplicates: ' + error.message }); return }
      ;(data || []).forEach(d => {
        existingByKey.set(`${d.mobile}|${d.type}`, d.name)
        knownMobiles.add(d.mobile)
        if (d.opt_out) optedOut.add(d.mobile)
      })
    }

    const isExisting = r => existingByKey.has(`${r.mobile}|${r.type}`)
    const fresh = unique.filter(r => !isExisting(r)).map(r => ({ ...r, optOut: optedOut.has(r.mobile) }))
    setReport({
      checking:  false,
      fresh,
      existing:  unique.filter(isExisting).map(r => ({ ...r, existingName: existingByKey.get(`${r.mobile}|${r.type}`) })),
      fileDupes,
      alsoOther: fresh.filter(r => knownMobiles.has(r.mobile)).length,
    })
  }

  function handleRows(rows) {
    setImportRows(rows)
    analyze(rows)
  }

  function closeImport() {
    analyzeRun.current++
    setModal(null); setImportText(''); setImportRows([]); setReport(null); setAlert(null)
  }

  async function doImport() {
    const rows = report?.fresh || []
    if (!rows.length) { setAlert({ type:'error', msg:'No new contacts to import' }); return }
    setLoading(true); setAlert(null)
    const inserts = rows.map(({ optOut, ...r }) => ({ ...r, opt_out: optOut }))
    const { error } = await supabase.from('contacts').upsert(inserts, { onConflict: 'mobile,type', ignoreDuplicates: true })
    if (error) setAlert({ type:'error', msg: error.message })
    else {
      const skipped = report.existing.length + report.fileDupes.length
      setAlert({ type:'success', msg: `${inserts.length} contacts added. ${skipped} duplicate${skipped === 1 ? '' : 's'} skipped.` })
      load()
      setTimeout(closeImport, 1800)
    }
    setLoading(false)
  }

  async function del(id) {
    if (!confirm('Delete this contact?')) return
    await supabase.from('contacts').delete().eq('id', id)
    load()
  }

  async function optOut(c) {
    if (!confirm('Mark as opted out? They will be excluded from all future campaigns, in every list this number is in.')) return
    await supabase.from('contacts').update({ opt_out: true }).eq('mobile', c.mobile)
    load()
  }

  function typeBadge(t) {
    const cls = { Customer:'badge-teal', Lead:'badge-gray', VIP:'badge-gold', Prospect:'badge-gray' }
    return <span className={`badge ${cls[t]||'badge-gray'}`}>{t}</span>
  }

  return (
    <div className="page-wrap">
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
          <button className="btn btn-sm" onClick={exportCsv} disabled={exporting}>
            {exporting ? <span className="spinner"/> : <><i className="ti ti-download"/>Export</>}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { setAddForm({name:'',mobile:'',city:'',type:'Customer',notes:''}); setAlert(null); setModal('add') }}>
            <i className="ti ti-plus"/>Add contact
          </button>
        </div>

        <div className="card" style={{padding:0}}>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th style={{width:44}}>#</th><th>Name</th><th>Mobile</th><th>City</th><th>Type</th><th>Status</th><th>Added</th><th></th></tr></thead>
              <tbody>
                {contacts.length === 0
                  ? <tr><td colSpan={8}><div className="empty-state"><i className="ti ti-users"/><p>No contacts found.</p></div></td></tr>
                  : contacts.map((c, i) => (
                  <tr key={c.id}>
                    <td style={{color:'var(--ink-3)',fontSize:11.5}}>{i + 1}</td>
                    <td style={{fontWeight:600}}>{c.name||'—'}</td>
                    <td style={{fontFamily:'var(--mono)',fontSize:11.5,color:'var(--ink-2)'}}>{c.mobile}</td>
                    <td style={{color:'var(--ink-2)'}}>{c.city||'—'}</td>
                    <td>{typeBadge(c.type)}</td>
                    <td>{c.opt_out?<span className="badge badge-red">Opted out</span>:<span className="badge badge-green">Active</span>}</td>
                    <td style={{color:'var(--ink-3)',fontSize:11}}>{fmtD(c.created_at)}</td>
                    <td>
                      <div style={{display:'flex',gap:4}}>
                        {!c.opt_out && <button className="btn btn-ghost btn-sm" style={{fontSize:10.5}} onClick={()=>optOut(c)}>Opt-out</button>}
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
        <Modal title="Import contacts" wide onClose={closeImport}>
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
                  value={importText} onChange={e => { setImportText(e.target.value); handleRows(parseLines(e.target.value)) }}/>
              </div>
            : <div className="form-group">
                <input type="file" accept=".csv" className="form-input" style={{padding:6}}
                  onChange={async e => { const t = await e.target.files[0]?.text(); if(t){ setImportText(t); handleRows(parseLines(t)) } }}/>
              </div>
          }
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--ink-3)',marginBottom:14}}>
            <span>{importRows.length} rows detected</span>
            <span>Duplicates skipped · Opted-out excluded on send</span>
          </div>
          {report?.checking && <div style={{fontSize:12,color:'var(--ink-3)',marginBottom:14}}>Checking for duplicates…</div>}
          {report && !report.checking && (() => {
            const dupes = [
              ...report.existing.map(r => ({ ...r, reason: `Already in ${r.type} list` + (r.existingName ? ` as "${r.existingName}"` : '') })),
              ...report.fileDupes.map(r => ({ ...r, reason: `Repeated in this file (${r.type})` })),
            ]
            return (
              <>
                <div className={`alert ${dupes.length ? 'alert-warn' : 'alert-success'}`}>
                  <i className={`ti ti-${dupes.length ? 'alert-triangle' : 'circle-check'}`}/>
                  <div>
                    <b>{fmt(report.fresh.length)} new</b> will be imported.
                    {report.existing.length > 0 && <> <b>{fmt(report.existing.length)}</b> already in the same list.</>}
                    {report.fileDupes.length > 0 && <> <b>{fmt(report.fileDupes.length)}</b> repeated within the file.</>}
                    {dupes.length > 0 && <> Duplicates are skipped.</>}
                    {report.alsoOther > 0 && <> <b>{fmt(report.alsoOther)}</b> of the new ones already exist under a different type and will be added to this type too.</>}
                  </div>
                </div>
                {dupes.length > 0 && (
                  <div className="tbl-wrap" style={{maxHeight:180,overflowY:'auto',marginBottom:14,border:'1px solid var(--border-2)',borderRadius:'var(--r)'}}>
                    <table>
                      <thead><tr><th>Mobile</th><th>Name in file</th><th>Reason</th></tr></thead>
                      <tbody>
                        {dupes.map((r, i) => (
                          <tr key={i}>
                            <td style={{fontFamily:'var(--mono)',fontSize:11.5}}>{r.mobile}</td>
                            <td>{r.name || '—'}</td>
                            <td style={{color:'var(--ink-2)'}}>{r.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )
          })()}
          <div className="modal-footer">
            <button className="btn" onClick={closeImport}>Cancel</button>
            <button className="btn btn-primary" onClick={doImport} disabled={loading||!report||report.checking||!report.fresh.length}>
              {loading?<span className="spinner"/>:`Import ${report && !report.checking ? report.fresh.length : 0} new contacts`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
