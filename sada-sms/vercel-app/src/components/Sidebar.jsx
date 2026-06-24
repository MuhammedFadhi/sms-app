import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../App'

const NAV = [
  { to: '/',          icon: 'ti-layout-dashboard', label: 'Dashboard'      },
  { to: '/templates', icon: 'ti-template',          label: 'Templates'      },
  { to: '/contacts',  icon: 'ti-users',             label: 'Contacts'       },
  { to: '/compose',   icon: 'ti-send',              label: 'Compose & send' },
  { to: '/reports',   icon: 'ti-chart-bar',         label: 'Reports'        },
]

export default function Sidebar() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const initials = name => (name || '?').split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="sidebar">
      <div className="sb-brand">
        <div className="sb-logo"><i className="ti ti-droplet"/></div>
        <div>
          <div className="sb-name">SA'DA H2O</div>
          <div className="sb-tagline">SMS Platform</div>
        </div>
      </div>

      <nav className="sb-nav">
        <div className="sb-section">Main</div>
        {NAV.map(n => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            <i className={`ti ${n.icon}`}/>{n.label}
          </NavLink>
        ))}
        {profile?.role === 'admin' && <>
          <div className="sb-section">Admin</div>
          <NavLink to="/users" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <i className="ti ti-user-plus"/>Users
          </NavLink>
        </>}
      </nav>

      <div className="sb-footer">
        <div className="sb-user">
          <div className="sb-avatar">{initials(profile?.full_name || profile?.email)}</div>
          <div>
            <div className="sb-username">{profile?.full_name || profile?.email?.split('@')[0]}</div>
            <div className="sb-role">{profile?.role || 'staff'}</div>
          </div>
        </div>
        <button className="sb-signout" onClick={handleSignOut}>
          <i className="ti ti-logout"/>Sign out
        </button>
      </div>
    </div>
  )
}
