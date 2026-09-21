import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Modal from '../components/Modal'

const CATS = ['All','Seasonal','Product','Promotional','Follow-up','Custom']
const LANGS = [{ v:'both', l:'AR + EN' },{ v:'ar', l:'Arabic only' },{ v:'en', l:'English only' }]

export default function Templates() {
  const [templates, setTemplates] = useState([])
  const [cat, setCat]             = useState('All')
  const [modal, setModal]         = useState(null)  // null | 'add' | template obj
  const [preview, setPreview]     = useState(null)
  const [form, setForm]           = useState({ name:'', category:'Seasonal', lang:'both', body_ar:'', body_en:'' })
  const [saving, setSaving]       = useState(false)
  const [alert, setAlert]         = useState(null)

  const load = async () => {
    const { data } = await supabase.from('templates').select('*').order('category').order('name')
    setTemplates(data || [])
  }
  useEffect(() => { load() }, [])

  const filtered = cat === 'All' ? templates : templates.filter(t => t.category === cat)

  function openAdd() {
    setForm({ name:'', category:'Seasonal', lang:'both', body_ar:'', body_en:'' })
    setModal('add')
  }
  function openEdit(t) {
    setForm({ name:t.name, category:t.category, lang:t.lang, body_ar:t.body_ar||'', body_en:t.body_en||'' })
    setModal(t)
  }

  async function save() {
    if (!form.name.trim()) { setAlert({ type:'error', msg:'Name is required' }); return }
    setSaving(true); setAlert(null)
    try {
      if (modal === 'add') {
        await supabase.from('templates').insert({ ...form })
      } else {
        await supabase.from('templates').update({ ...form }).eq('id', modal.id)
      }
      setModal(null); load()
    } catch(e) { setAlert({ type:'error', msg: e.message }) }
    finally { setSaving(false) }
  }

  async function del(id, name) {
    if (!confirm(`Delete "${name}"?`)) return
    await supabase.from('templates').delete().eq('id', id)
    load()
  }

  const langLabel = v => LANGS.find(l => l.v === v)?.l || v

  return (
    <div className="page-wrap">
      <div className="subnav">
        {CATS.map(c => (
          <button key={c} className={`subnav-tab ${cat===c?'active':''}`} onClick={() => setCat(c)}>{c}</button>
        ))}
        <div style={{flex:1}}/>
        <button className="btn btn-primary btn-sm" style={{margin:'6px 0'}} onClick={openAdd}>
          <i className="ti ti-plus"/>New template
        </button>
      </div>

      <div className="page-content">
        {filtered.length === 0
          ? <div className="empty-state"><i className="ti ti-template"/><p>No templates in this category.</p></div>
          : <div className="grid-2">
              {filtered.map(t => (
                <div key={t.id} className="card" style={{margin:0}}>
                  <div style={{padding:'13px 14px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,marginBottom:8}}>
                      <div style={{fontWeight:600,fontSize:13}}>{t.name}</div>
                      <div style={{display:'flex',gap:4,flexShrink:0}}>
                        <button className="btn btn-ghost btn-sm" style={{padding:'3px 7px'}} onClick={() => setPreview(t)}><i className="ti ti-eye" style={{fontSize:12}}/></button>
                        <button className="btn btn-ghost btn-sm" style={{padding:'3px 7px'}} onClick={() => openEdit(t)}><i className="ti ti-edit" style={{fontSize:12}}/></button>
                        <button className="btn btn-ghost btn-sm" style={{padding:'3px 7px'}} onClick={() => del(t.id, t.name)}><i className="ti ti-trash" style={{fontSize:12}}/></button>
                      </div>
                    </div>
                    <div style={{display:'flex',gap:5,marginBottom:8}}>
                      <span className="badge badge-teal">{t.category}</span>
                      <span className="badge badge-gray">{langLabel(t.lang)}</span>
                    </div>
                    {t.body_ar && (
                      <div style={{background:'var(--surface-2)',borderRadius:'var(--r)',padding:'7px 9px',fontSize:10.5,direction:'rtl',textAlign:'right',color:'var(--ink-2)',lineHeight:1.55}}>
                        {t.body_ar.slice(0,100)}{t.body_ar.length>100?'…':''}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
        }
      </div>

      {modal && (
        <Modal title={modal==='add'?'New template':'Edit template'} onClose={() => { setModal(null); setAlert(null) }}>
          {alert && <div className={`alert alert-${alert.type}`}><i className={`ti ti-${alert.type==='error'?'alert-circle':'circle-check'}`}/>{alert.msg}</div>}
          <div className="form-group"><label className="form-label">Template name</label>
            <input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Eid Al-Fitr greeting"/>
          </div>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Category</label>
              <select className="form-select" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
                {['Seasonal','Product','Promotional','Follow-up','Custom'].map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Language</label>
              <select className="form-select" value={form.lang} onChange={e=>setForm({...form,lang:e.target.value})}>
                {LANGS.map(l=><option key={l.v} value={l.v}>{l.l}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group"><label className="form-label">Arabic (AR) — use {'{{name}}'} to personalize</label>
            <textarea className="form-textarea" style={{direction:'rtl',minHeight:80}} value={form.body_ar} onChange={e=>setForm({...form,body_ar:e.target.value})} placeholder="اكتب النص هنا…"/>
            <div className="form-hint">{form.body_ar.length} chars · {Math.ceil(form.body_ar.length/70)||1} SMS</div>
          </div>
          <div className="form-group"><label className="form-label">English (EN)</label>
            <textarea className="form-textarea" style={{minHeight:80}} value={form.body_en} onChange={e=>setForm({...form,body_en:e.target.value})} placeholder="Write English text here…"/>
            <div className="form-hint">{form.body_en.length} chars · {Math.ceil(form.body_en.length/160)||1} SMS</div>
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={() => { setModal(null); setAlert(null) }}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<span className="spinner"/>:'Save template'}</button>
          </div>
        </Modal>
      )}

      {preview && (
        <Modal title={preview.name} onClose={() => setPreview(null)}>
          {preview.body_ar && <>
            <div style={{fontSize:11,color:'var(--ink-3)',marginBottom:5}}>Arabic (AR)</div>
            <div style={{background:'var(--surface-2)',borderRadius:'var(--r)',padding:'10px 12px',direction:'rtl',textAlign:'right',fontSize:13,lineHeight:1.6,marginBottom:4,whiteSpace:'pre-wrap'}}>{preview.body_ar}</div>
            <div style={{fontSize:10,color:'var(--ink-3)',textAlign:'right',marginBottom:14}}>{preview.body_ar.length} chars · {Math.ceil(preview.body_ar.length/70)||1} SMS</div>
          </>}
          {preview.body_en && <>
            <div style={{fontSize:11,color:'var(--ink-3)',marginBottom:5}}>English (EN)</div>
            <div style={{background:'var(--surface-2)',borderRadius:'var(--r)',padding:'10px 12px',fontSize:13,lineHeight:1.6,marginBottom:4,whiteSpace:'pre-wrap'}}>{preview.body_en}</div>
            <div style={{fontSize:10,color:'var(--ink-3)',textAlign:'right'}}>{preview.body_en.length} chars · {Math.ceil(preview.body_en.length/160)||1} SMS</div>
          </>}
          <div className="modal-footer"><button className="btn" onClick={() => setPreview(null)}>Close</button></div>
        </Modal>
      )}
    </div>
  )
}
