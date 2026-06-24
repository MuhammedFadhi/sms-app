import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const COST = 0.06
const fmt  = n => Number(n||0).toLocaleString()
const fmtC = n => 'SAR ' + Number(n||0).toFixed(2)

export default function Compose() {
  const [templates, setTemplates]   = useState([])
  const [contactCounts, setCounts]  = useState({ all:0, Customer:0, Lead:0, VIP:0 })
  const [form, setForm]             = useState({ name:'', list:'all', lang:'both', useTemplate:true, templateId:'', customAr:'', customEn:'' })
  const [msgAr, setMsgAr]           = useState('')
  const [msgEn, setMsgEn]           = useState('')
  const [sending, setSending]       = useState(false)
  const [result, setResult]         = useState(null)
  const [alert, setAlert]           = useState(null)

  useEffect(() => {
    supabase.from('templates').select('*').order('category').order('name').then(r => setTemplates(r.data||[]))
    supabase.from('contacts').select('type, opt_out').then(r => {
      const all = (r.data||[]).filter(c => !c.opt_out)
      setCounts({
        all:      all.length,
        Customer: all.filter(c=>c.type==='Customer').length,
        Lead:     all.filter(c=>c.type==='Lead').length,
        VIP:      all.filter(c=>c.type==='VIP').length,
      })
    })
  }, [])

  function onTemplateChange(id) {
    const t = templates.find(t => t.id === id)
    if (!t) return
    setMsgAr(t.body_ar || '')
    setMsgEn(t.body_en || '')
  }

  const recipientCount = contactCounts[form.list] || 0
  const arSms   = form.lang !== 'en' ? (Math.ceil(msgAr.length/70)||1) : 0
  const enSms   = form.lang !== 'ar' ? (Math.ceil(msgEn.length/160)||1) : 0
  const smsEach = form.lang === 'both' ? arSms + enSms : form.lang === 'ar' ? arSms : enSms
  const totalSms = recipientCount * (smsEach || 1)
  const estCost  = totalSms * COST

  async function send() {
    setAlert(null)
    if (!form.name.trim())     { setAlert({ type:'error', msg:'Enter a campaign name' }); return }
    if (!msgAr && !msgEn)      { setAlert({ type:'error', msg:'Write a message or select a template' }); return }
    if (recipientCount === 0)  { setAlert({ type:'error', msg:'No active contacts in selected list' }); return }
    if (!confirm(`Send to ${fmt(recipientCount)} contacts?\nEstimated cost: ${fmtC(estCost)}`)) return

    setSending(true)
    try {
      // 1. Create campaign record in Supabase
      const { data: camp, error: campErr } = await supabase.from('campaigns').insert({
        name:        form.name.trim(),
        template_id: form.templateId || null,
        list_filter: form.list,
        lang:        form.lang,
        total:       recipientCount,
        delivered:   0,
        failed:      0,
        cost:        0,
      }).select().single()
      if (campErr) throw campErr

      // 2. Fetch contacts
      let q = supabase.from('contacts').select('id, name, mobile').eq('opt_out', false)
      if (form.list !== 'all') q = q.eq('type', form.list)
      const { data: contacts } = await q

      // 3. Hand off to DO relay — it handles the bulk loop and updates Supabase
      const res = await fetch('/api/send-campaign', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          campaignId: camp.id,
          contacts:   contacts || [],
          lang:       form.lang,
          body_ar:    msgAr,
          body_en:    msgEn,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Send failed') }

      setResult({ campaignId: camp.id, total: recipientCount })
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
        <div style={{fontSize:20,fontWeight:700,marginBottom:8}}>Campaign queued!</div>
        <div style={{color:'var(--ink-2)',fontSize:13,marginBottom:24}}>
          Sending to {fmt(result.total)} contacts in the background.<br/>
          Check Reports for live delivery status.
        </div>
        <button className="btn btn-primary" onClick={() => { setResult(null); setForm({name:'',list:'all',lang:'both',useTemplate:true,templateId:'',customAr:'',customEn:''}); setMsgAr(''); setMsgEn('') }}>
          New campaign
        </button>
      </div>
    </div>
  )

  return (
    <div className="page-content">
      {alert && <div className={`alert alert-${alert.type}`}><i className={`ti ti-${alert.type==='error'?'alert-circle':'info-circle'}`}/>{alert.msg}</div>}

      <div className="compose-layout">
        <div>
          {/* Campaign details */}
          <div className="card">
            <div className="card-head"><div className="card-title"><i className="ti ti-speakerphone"/>Campaign details</div></div>
            <div className="card-body">
              <div className="form-group"><label className="form-label">Campaign name</label>
                <input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Eid Al-Fitr 2026"/>
              </div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Send to</label>
                  <select className="form-select" value={form.list} onChange={e=>setForm({...form,list:e.target.value})}>
                    <option value="all">All contacts ({fmt(contactCounts.all)})</option>
                    <option value="Customer">Customers ({fmt(contactCounts.Customer)})</option>
                    <option value="Lead">Leads ({fmt(contactCounts.Lead)})</option>
                    <option value="VIP">VIP ({fmt(contactCounts.VIP)})</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Language</label>
                  <div className="lang-toggle">
                    {[['both','AR + EN'],['ar','AR only'],['en','EN only']].map(([v,l]) => (
                      <div key={v} className={`lang-opt ${form.lang===v?'active':''}`} onClick={()=>setForm({...form,lang:v})}>{l}</div>
                    ))}
                  </div>
                </div>
              </div>
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
                Use <code style={{background:'rgba(23,184,208,.15)',padding:'1px 5px',borderRadius:3,fontSize:10.5}}>{'{{name}}'}</code> to personalize each message with the recipient's name.
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
                    <div className="sms-bubble rtl">{msgAr.replace(/\{\{name\}\}/g,'عميلنا الكريم')}</div>
                  )}
                  {msgEn && form.lang !== 'ar' && (
                    <div className="sms-bubble">{msgEn.replace(/\{\{name\}\}/g,'Valued Customer')}</div>
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
              ['Recipients',       fmt(recipientCount)     ],
              ['SMS per recipient', smsEach || '—'         ],
              ['Total messages',   fmt(totalSms)           ],
              ['Sender ID',        'SADA.Co-AD'            ],
              ['Est. cost',        fmtC(estCost)           ],
            ].map(([l,v]) => (
              <div key={l} className="summary-row"><span className="summary-label">{l}</span><span className="summary-value">{v}</span></div>
            ))}
            <button className="send-btn" onClick={send} disabled={sending || recipientCount === 0}>
              {sending ? <><span className="spinner"/>Sending…</> : <><i className="ti ti-send"/>Send to {fmt(recipientCount)} contacts</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
