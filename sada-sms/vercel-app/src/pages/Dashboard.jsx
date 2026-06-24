import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

const fmt  = n => Number(n || 0).toLocaleString()
const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'
const fmtC = n => 'SAR ' + Number(n || 0).toFixed(2)

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats]   = useState(null)
  const [recent, setRecent] = useState([])
  const [tpls, setTpls]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [contRes, campRes, tplRes] = await Promise.all([
        supabase.from('contacts').select('type, opt_out'),
        supabase.from('campaigns').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('templates').select('id, name, category').limit(3),
      ])
      const contacts  = contRes.data || []
      const campaigns = campRes.data || []
      const allCamp   = (await supabase.from('campaigns').select('total, delivered, cost')).data || []

      const totalSent = allCamp.reduce((s,c) => s + (c.total||0), 0)
      const totalDel  = allCamp.reduce((s,c) => s + (c.delivered||0), 0)
      const totalCost = allCamp.reduce((s,c) => s + (c.cost||0), 0)

      setStats({
        contacts:  contacts.length,
        customers: contacts.filter(c => c.type === 'Customer').length,
        leads:     contacts.filter(c => c.type === 'Lead').length,
        vip:       contacts.filter(c => c.type === 'VIP').length,
        opted_out: contacts.filter(c => c.opt_out).length,
        campaigns: allCamp.length,
        sent:      totalSent,
        delivered: totalDel,
        cost:      totalCost,
        rate:      totalSent ? Math.round((totalDel / totalSent) * 100) : 0,
      })
      setRecent(campaigns)
      setTpls(tplRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="page-content"><div style={{textAlign:'center',padding:40}}><div className="spinner spinner-teal"/></div></div>

  const breakdown = [
    { label:'Customers', value: stats.customers, color:'var(--teal)' },
    { label:'Leads',     value: stats.leads,     color:'var(--gold)' },
    { label:'VIP',       value: stats.vip,        color:'#a16207'    },
    { label:'Opted out', value: stats.opted_out,  color:'var(--err)' },
  ]

  return (
    <div className="page-content">
      <div className="grid-4" style={{ marginBottom: 18 }}>
        {[
          { label:'Total contacts', value: fmt(stats.contacts),    sub: `${fmt(stats.opted_out)} opted out`    },
          { label:'SMS sent',       value: fmt(stats.sent),        sub: `${fmt(stats.campaigns)} campaigns`    },
          { label:'Delivery rate',  value: stats.rate + '%',       sub: 'all time average', cls: 'ok'          },
          { label:'Total spend',    value: fmtC(stats.cost),       sub: 'all time',         cls: 'gold'        },
        ].map(s => (
          <div key={s.label} className={`stat-card ${s.cls||''}`}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={s.cls==='ok'?{color:'var(--ok)'}:{}}>{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:14 }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title"><i className="ti ti-speakerphone"/>Recent campaigns</div>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/compose')}>
              <i className="ti ti-plus"/>New campaign
            </button>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Name</th><th>List</th><th>Delivered</th><th>Cost</th><th>Date</th></tr></thead>
              <tbody>
                {recent.length === 0
                  ? <tr><td colSpan={5}><div className="empty-state"><i className="ti ti-speakerphone"/><p>No campaigns yet</p></div></td></tr>
                  : recent.map(c => (
                  <tr key={c.id}>
                    <td style={{fontWeight:600}}>{c.name}</td>
                    <td><span className="badge badge-gray">{c.list_filter}</span></td>
                    <td>{c.finished_at
                      ? <span className="badge badge-green">{fmt(c.delivered)}</span>
                      : <span className="badge badge-amber">Sending…</span>}
                    </td>
                    <td style={{color:'var(--ink-2)'}}>{c.finished_at ? fmtC(c.cost) : '—'}</td>
                    <td style={{color:'var(--ink-3)',fontSize:11}}>{fmtD(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="card" style={{marginBottom:14}}>
            <div className="card-head"><div className="card-title"><i className="ti ti-users"/>Contacts</div></div>
            <div className="card-body">
              {breakdown.map(b => (
                <div key={b.label} className="progress-row">
                  <div className="progress-label">{b.label}</div>
                  <div className="progress-bar-wrap">
                    <div className="progress-bar-fill" style={{ width: `${Math.round((b.value/(stats.contacts||1))*100)}%`, background: b.color }}/>
                  </div>
                  <div className="progress-count">{fmt(b.value)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title"><i className="ti ti-bolt"/>Quick send</div></div>
            <div className="card-body" style={{display:'flex',flexDirection:'column',gap:6}}>
              {tpls.map(t => (
                <div key={t.id}
                  style={{padding:'8px 10px',border:'1px solid var(--border)',borderRadius:'var(--r)',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}
                  onMouseOver={e=>e.currentTarget.style.borderColor='var(--teal)'}
                  onMouseOut={e=>e.currentTarget.style.borderColor='var(--border)'}
                  onClick={() => navigate('/compose')}
                >
                  <div style={{fontSize:12,fontWeight:500}}>{t.name}</div>
                  <span className="badge badge-teal">{t.category}</span>
                </div>
              ))}
              {tpls.length === 0 && <div style={{color:'var(--ink-3)',fontSize:12}}>No templates yet</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
