import React from 'react'

export default function Topbar({ title, sub }) {
  return (
    <div className="topbar">
      <div>
        <div className="topbar-title">{title}</div>
        {sub && <div className="topbar-sub">{sub}</div>}
      </div>
      <div className="topbar-right">
        <div className="status-chip">
          <i className="ti ti-circle-check"/>Taqnyat connected
        </div>
      </div>
    </div>
  )
}
