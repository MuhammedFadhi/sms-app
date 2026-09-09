import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Modal from '../components/Modal'

const fmt  = n => Number(n||0).toLocaleString()
const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'
const fmtC = n => 'SAR ' + Number(n||0).toFixed(2)

export default function Reports() {
  const [campaigns, setCampaigns] = useState([])
  const [stats, setStats]         = useState({})
  const [logs, setLogs]           = useState([])
  const [logCamp, setLogCamp]     = useState(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function load() {
      const [campRes] = await Promise.all([
        supabase.from('campaigns').select('*').order('created_at', { ascending: false }),
      ])
      const camps = campRes.data || []
      setCampaigns(camps)
      setStats({
        total:    camps.length,
        sent:     camps.reduce((s,c)=>s+(c.total||0),0),
        del:      camps.reduce((s,c)=>s+(c.delivered||0),0),
        cost:     camps.reduce((s,c)=>s+(c.cost||0),0),
      })
      setLoading(false)
    }
    load()
    // Poll every 8s for in-progress campaigns
    const iv = setInterval(load, 8000)
    return () => clearInterval(iv)
  }, [])

  async function viewLogs(c) {
    setLogCamp(c)
    const { data } = await supabase.from('send_logs').select('*').eq('campaign_id', c.id).order('sent_at')
    setLogs(data || [])
  }

  const rate = stats.sent > 0 ? Math.round((stats.del / stats.sent) * 100) : 0

  if (loading) return <div className="page-content"><div style={{textAlign:'center',padding:40}}><div className="spinner spinner-teal"/></div></div>

  return (
    <div className="page-content">
      <div className="grid-4" style={{marginBottom:18}}>
        {[
          { label:'Campaigns',    value: fmt(stats.total), cls:''     },
          { label:'SMS sent',     value: fmt(stats.sent),  cls:''     },
          { label:'Delivery rate',value: rate+'%',         cls:'ok'   },
          { label:'Total spend',  value: fmtC(stats.cost), cls:'gold' },
        ].map(s => (
          <div key={s.label} className={`stat-card ${s.cls}`}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={s.cls==='ok'?{color:'var(--ok)'}:{}}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{padding:0}}>
        <div className="card-head" style={{padding:'12px 16px'}}>
          <div className="card-title"><i className="ti ti-table"/>Campaign log</div>
        </div>
        {campaigns.length === 0
          ? <div className="empty-state"><i className="ti ti-chart-bar"/><p>No campaigns yet. Go to Compose to send your first one.</p></div>
          : <div className="tbl-wrap">
              <table>
                <thead><tr><th>Campaign</th><th>List</th><th>Lang</th><th>Sent</th><th>Delivered</th><th>Failed</th><th>Cost</th><th>Date</th><th></th></tr></thead>
                <tbody>
                  {campaigns.map(c => (
                    <tr key={c.id}>
                      <td style={{fontWeight:600}}>{c.name}</td>
                      <td><span className="badge badge-gray">{c.list_filter}</span></td>
                      <td><span className="badge badge-gray">{c.lang}</span></td>
                      <td>{fmt(c.total)}</td>
                      <td><span className="badge badge-green">{fmt(c.delivered)}</span></td>
                      <td>{c.failed>0?<span className="badge badge-red">{fmt(c.failed)}</span>:<span style={{color:'var(--ink-3)'}}>0</span>}</td>
                      <td>{c.finished_at ? fmtC(c.cost) : <span className="badge badge-amber">Sending…</span>}</td>
                      <td style={{color:'var(--ink-3)',fontSize:11}}>{fmtD(c.created_at)}</td>
                      <td><button className="btn btn-ghost btn-sm" onClick={()=>viewLogs(c)}><i className="ti ti-eye"/></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </div>

      {logCamp && (
        <Modal title={`${logCamp.name} — send log`} wide onClose={() => { setLogCamp(null); setLogs([]) }}>
          <div style={{maxHeight:380,overflowY:'auto'}}>
            <table>
              <thead><tr><th>Name</th><th>Mobile</th><th>Status</th><th>Time</th></tr></thead>
              <tbody>
                {logs.length === 0
                  ? <tr><td colSpan={4} style={{textAlign:'center',color:'var(--ink-3)',padding:20}}>No logs yet — campaign may still be sending.</td></tr>
                  : logs.map(l => (
                  <tr key={l.id}>
                    <td>{l.name||'—'}</td>
                    <td style={{fontFamily:'var(--mono)',fontSize:11}}>{l.mobile}</td>
                    <td><span className={`badge ${l.status==='delivered'?'badge-green':l.status==='failed'?'badge-red':'badge-amber'}`}>{l.status}</span></td>
                    <td style={{fontSize:11,color:'var(--ink-3)'}}>{fmtD(l.sent_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modal-footer"><button className="btn" onClick={()=>{ setLogCamp(null); setLogs([]) }}>Close</button></div>
        </Modal>
      )}
    </div>
  )
}
