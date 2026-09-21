import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const COST = 0.06
const fmt  = n => Number(n||0).toLocaleString()
const fmtC = n => 'SAR ' + Number(n||0).toFixed(2)

function normMobile(m) {
  let n = String(m).replace(/\D/g, '')
  if (n.startsWith('00966')) n = n.slice(2)
  if (n.startsWith('0'))     n = '966' + n.slice(1)
  if (!n.startsWith('966'))  n = '966' + n
  return n
}

// A number can be in several lists; opting out anywhere blocks it everywhere.
async function fetchActiveContacts() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('contacts').select('id, name, mobile, type, opt_out').order('id').range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) break
  }
  const blocked = new Set(rows.filter(c => c.opt_out).map(c => c.mobile))
  return rows.filter(c => !blocked.has(c.mobile))
}

// One entry per mobile number, even if it appears under several types.
function pickRecipients(active, list) {
  const byMobile = new Map()
  active.forEach(c => {
    if (list !== 'all' && c.type !== list) return
    const prev = byMobile.get(c.mobile)
    if (!prev) byMobile.set(c.mobile, { id: c.id, name: c.name, mobile: c.mobile })
    else if (!prev.name && c.name) prev.name = c.name
  })
  return [...byMobile.values()]
}

export default function Compose() {
  const [mode, setMode]              = useState('bulk')   // 'bulk' | 'single'
  const [templates, setTemplates]    = useState([])
  const [contactCounts, setCounts]   = useState({ all:0 })
  const [types, setTypes]            = useState(['Customer','Lead','VIP','Prospect'])
  const [form, setForm]              = useState({ name:'', list:'all', lang:'both', useTemplate:true, templateId:'' })
  const [msgAr, setMsgAr]            = useState('')
  const [msgEn, setMsgEn]            = useState('')
  // Single send
  const [single, setSingle]          = useState({ name:'', mobile:'' })
  const [sending, setSending]        = useState(false)
  const [result, setResult]          = useState(null)
  const [alert, setAlert]            = useState(null)

  useEffect(() => {
    supabase.from('templates').select('*').order('category').order('name').then(r => setTemplates(r.data||[]))
    supabase.from('contact_types').select('name').order('created_at').order('name').then(r => {
      if (!r.error && r.data?.length) setTypes(r.data.map(t => t.name))
    })
    fetchActiveContacts().then(active => {
      const counts = { all: pickRecipients(active, 'all').length }
      new Set(active.map(c => c.type)).forEach(t => { counts[t] = pickRecipients(active, t).length })
      setCounts(counts)
    }).catch(() => {})
  }, [])

  function onTemplateChange(id) {
    const t = templates.find(t => t.id === id)
    if (!t) return
    setMsgAr(t.body_ar || '')
    setMsgEn(t.body_en || '')
  }

  const recipientCount = mode === 'single' ? (single.mobile ? 1 : 0) : (contactCounts[form.list] || 0)
  const arSms    = form.lang !== 'en' ? (Math.ceil(msgAr.length/70)||1) : 0
  const enSms    = form.lang !== 'ar' ? (Math.ceil(msgEn.length/160)||1) : 0
  const smsEach  = form.lang === 'both' ? arSms + enSms : form.lang === 'ar' ? arSms : enSms
  const totalSms = recipientCount * (smsEach || 1)
  const estCost  = totalSms * COST

  function resetForm() {
    setResult(null)
    setForm({ name:'', list:'all', lang:'both', useTemplate:true, templateId:'' })
    setMsgAr(''); setMsgEn('')
    setSingle({ name:'', mobile:'' })
    setAlert(null)
  }

  async function send() {
    setAlert(null)

    // Validate
    if (!form.name.trim()) { setAlert({ type:'error', msg:'Enter a campaign name' }); return }
    if (!msgAr && !msgEn)  { setAlert({ type:'error', msg:'Write a message or select a template' }); return }

    if (mode === 'single') {
      if (!single.mobile) { setAlert({ type:'error', msg:'Enter a mobile number' }); return }
    } else {
      if (recipientCount === 0) { setAlert({ type:'error', msg:'No active contacts in selected list' }); return }
    }

    if (!confirm(`Send to ${fmt(recipientCount)} recipient${recipientCount>1?'s':''}?\nEst. cost: ${fmtC(estCost)}`)) return

    setSending(true)
    try {
      let contacts = []

      if (mode === 'single') {
        contacts = [{ id: '', name: single.name || 'عميلنا الكريم', mobile: normMobile(single.mobile) }]
      } else {
        contacts = pickRecipients(await fetchActiveContacts(), form.list)
      }

      // Create campaign record
      const { data: camp, error: campErr } = await supabase.from('campaigns').insert({
        name:        form.name.trim(),
        template_id: form.templateId || null,
        list_filter: mode === 'single' ? 'single' : form.list,
        lang:        form.lang,
        total:       contacts.length,
        delivered:   0,
        failed:      0,
        cost:        0,
      }).select().single()
      if (campErr) throw campErr

      // Hand off to DO relay
      const res = await fetch('/api/send-campaign', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          campaignId: camp.id,
          contacts,
          lang:    form.lang,
          body_ar: msgAr,
          body_en: msgEn,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Send failed') }

      setResult({ campaignId: camp.id, total: contacts.length, single: mode === 'single' })
    } catch(e) {
      setAlert({ type:'error', msg: e.message })
    } finally {
      setSending(false)
    }
  }

  if (result) return (
    <div className="page-content">
      <div className="card" style={{textAlign:'center',padding:48}}>
        <div style={{fontSize:48,marginBottom:16}}>✅</div>
        <div style={{fontSize:20,fontWeight:700,marginBottom:8}}>
          {result.single ? 'Message sent!' : 'Campaign queued!'}
        </div>
        <div style={{color:'var(--ink-2)',fontSize:13,marginBottom:24}}>
          {result.single
            ? 'Your message has been sent successfully.'
            : <>Sending to {fmt(result.total)} contacts in the background.<br/>Check Reports for live delivery status.</>
          }
        </div>
        <button className="btn btn-primary" onClick={resetForm}>
          {result.single ? 'Send another' : 'New campaign'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="page-content">
      {/* Mode switcher */}
      <div style={{display:'flex',gap:8,marginBottom:18}}>
        <button
          className={`btn ${mode==='bulk'?'btn-primary':''}`}
          onClick={() => { setMode('bulk'); setAlert(null) }}
        >
          <i className="ti ti-users"/>Bulk campaign
        </button>
        <button
          className={`btn ${mode==='single'?'btn-primary':''}`}
          onClick={() => { setMode('single'); setAlert(null) }}
        >
          <i className="ti ti-user"/>Single contact
        </button>
      </div>

      {alert && <div className={`alert alert-${alert.type}`}><i className={`ti ti-${alert.type==='error'?'alert-circle':'info-circle'}`}/>{alert.msg}</div>}

      <div className="compose-layout">
        <div>
          {/* Campaign / send details */}
          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <i className={`ti ${mode==='single'?'ti-user':'ti-speakerphone'}`}/>
                {mode === 'single' ? 'Recipient' : 'Campaign details'}
              </div>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">{mode === 'single' ? 'Reference / label' : 'Campaign name'}</label>
                <input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}
                  placeholder={mode === 'single' ? 'e.g. Follow-up — Ahmed Al-Ghamdi' : 'e.g. Eid Al-Fitr 2026'}/>
              </div>

              {mode === 'single' ? (
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Name (optional)</label>
                    <input className="form-input" value={single.name} onChange={e=>setSingle({...single,name:e.target.value})} placeholder="Recipient name"/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Mobile number</label>
                    <input className="form-input" value={single.mobile} onChange={e=>setSingle({...single,mobile:e.target.value})} placeholder="05XXXXXXXX"/>
                    {single.mobile && <div className="form-hint">Will send to: {normMobile(single.mobile)}</div>}
                  </div>
                </div>
              ) : (
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Send to</label>
                    <select className="form-select" value={form.list} onChange={e=>setForm({...form,list:e.target.value})}>
                      <option value="all">All contacts ({fmt(contactCounts.all)})</option>
                      {types.map(t => (
                        <option key={t} value={t}>{({ Customer:'Customers', Lead:'Leads' })[t] || t} ({fmt(contactCounts[t])})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Language</label>
                    <div className="lang-toggle">
                      {[['both','AR + EN'],['ar','AR only'],['en','EN only']].map(([v,l]) => (
                        <div key={v} className={`lang-opt ${form.lang===v?'active':''}`} onClick={()=>setForm({...form,lang:v})}>{l}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {mode === 'single' && (
                <div className="form-group">
                  <label className="form-label">Language</label>
                  <div className="lang-toggle">
                    {[['both','AR + EN'],['ar','AR only'],['en','EN only']].map(([v,l]) => (
                      <div key={v} className={`lang-opt ${form.lang===v?'active':''}`} onClick={()=>setForm({...form,lang:v})}>{l}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Message */}
          <div className="card">
            <div className="card-head">
              <div className="card-title"><i className="ti ti-template"/>Message</div>
              <div style={{display:'flex',gap:5}}>
                <button className={`btn btn-sm ${form.useTemplate?'btn-primary':''}`} onClick={()=>setForm({...form,useTemplate:true})}>Use template</button>
                <button className={`btn btn-sm ${!form.useTemplate?'btn-primary':''}`} onClick={()=>setForm({...form,useTemplate:false})}>Write custom</button>
              </div>
            </div>
            <div className="card-body">
              {form.useTemplate && (
                <div className="form-group">
                  <label className="form-label">Select template</label>
                  <select className="form-select" value={form.templateId}
                    onChange={e => { setForm({...form,templateId:e.target.value}); onTemplateChange(e.target.value) }}>
                    <option value="">— Choose a template —</option>
                    {['Seasonal','Product','Promotional','Follow-up','Custom'].map(cat => {
                      const g = templates.filter(t=>t.category===cat)
                      return g.length ? <optgroup key={cat} label={cat}>{g.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</optgroup> : null
                    })}
                  </select>
                </div>
              )}
              <div className="alert alert-info" style={{fontSize:11.5}}>
                <i className="ti ti-info-circle"/>
                Use <code style={{background:'rgba(23,184,208,.15)',padding:'1px 5px',borderRadius:3,fontSize:10.5}}>{'{{name}}'}</code> to personalize with the recipient's name.
              </div>
              {form.lang !== 'en' && (
                <div className="form-group">
                  <label className="form-label">Arabic (AR)</label>
                  <textarea className="form-textarea" style={{direction:'rtl',minHeight:72}} value={msgAr} onChange={e=>setMsgAr(e.target.value)} placeholder="اكتب النص هنا…"/>
                  <div className="form-hint">{msgAr.length} chars · {Math.ceil(msgAr.length/70)||1} SMS per recipient</div>
                </div>
              )}
              {form.lang !== 'ar' && (
                <div className="form-group">
                  <label className="form-label">English (EN)</label>
                  <textarea className="form-textarea" style={{minHeight:72}} value={msgEn} onChange={e=>setMsgEn(e.target.value)} placeholder="Write English text here…"/>
                  <div className="form-hint">{msgEn.length} chars · {Math.ceil(msgEn.length/160)||1} SMS per recipient</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div>
          <div className="card">
            <div className="card-head"><div className="card-title"><i className="ti ti-device-mobile"/>Live preview</div></div>
            <div className="card-body" style={{display:'flex',justifyContent:'center',padding:'16px 10px'}}>
              <div className="phone-shell">
                <div className="phone-pill"/>
                <div className="phone-screen">
                  <div className="phone-from">SADA.Co-AD</div>
                  {msgAr && form.lang !== 'en' && (
                    <div className="sms-bubble rtl">{msgAr.replace(/\{\{name\}\}/g, single.name || 'عميلنا الكريم')}</div>
                  )}
                  {msgEn && form.lang !== 'ar' && (
                    <div className="sms-bubble">{msgEn.replace(/\{\{name\}\}/g, single.name || 'Valued Customer')}</div>
                  )}
                  {!msgAr && !msgEn && (
                    <div style={{fontSize:9.5,color:'#aaa',textAlign:'center',padding:'20px 0'}}>Preview will appear here</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="send-summary">
            {[
              ['Recipient',        mode==='single' ? (single.mobile ? normMobile(single.mobile) : '—') : fmt(recipientCount) + ' contacts'],
              ['SMS per recipient', smsEach || '—'],
              ['Total messages',   fmt(totalSms)],
              ['Sender ID',        'SADA.Co-AD'],
              ['Est. cost',        fmtC(estCost)],
            ].map(([l,v]) => (
              <div key={l} className="summary-row"><span className="summary-label">{l}</span><span className="summary-value">{v}</span></div>
            ))}
            <button className="send-btn" onClick={send} disabled={sending || recipientCount === 0}>
              {sending
                ? <><span className="spinner"/>Sending…</>
                : mode === 'single'
                  ? <><i className="ti ti-send"/>Send message</>
                  : <><i className="ti ti-send"/>Send to {fmt(recipientCount)} contacts</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
