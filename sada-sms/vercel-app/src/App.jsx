import React, { createContext, useContext, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Templates from './pages/Templates'
import Contacts from './pages/Contacts'
import Compose from './pages/Compose'
import Reports from './pages/Reports'
import Users from './pages/Users'

// ── Auth context ──────────────────────────────────────────────
const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(uid) {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
    setProfile(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthCtx.Provider value={{ user, profile, loading, signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  )
}

// ── Protected route ───────────────────────────────────────────
function Protected({ children, adminOnly }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}><div className="spinner spinner-teal"/></div>
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && profile?.role !== 'admin') return <Navigate to="/" replace />
  return children
}

// ── App shell with sidebar ────────────────────────────────────
function Shell({ children }) {
  const location = useLocation()
  const PAGE_LABELS = {
    '/':          { title: 'Dashboard',     sub: new Date().toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }) },
    '/templates': { title: 'Templates',     sub: 'Manage message templates' },
    '/contacts':  { title: 'Contacts',      sub: 'Manage your contact lists' },
    '/compose':   { title: 'Compose & send',sub: 'Create a campaign and send to your contacts' },
    '/reports':   { title: 'Reports',       sub: 'Campaign history and delivery analytics' },
    '/users':     { title: 'Users',         sub: 'Manage platform access' },
  }
  const lbl = PAGE_LABELS[location.pathname] || { title: '', sub: '' }
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Topbar title={lbl.title} sub={lbl.sub} />
        {children}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Shell><Dashboard /></Shell></Protected>} />
          <Route path="/templates" element={<Protected><Shell><Templates /></Shell></Protected>} />
          <Route path="/contacts"  element={<Protected><Shell><Contacts /></Shell></Protected>} />
          <Route path="/compose"   element={<Protected><Shell><Compose /></Shell></Protected>} />
          <Route path="/reports"   element={<Protected><Shell><Reports /></Shell></Protected>} />
          <Route path="/users"     element={<Protected adminOnly><Shell><Users /></Shell></Protected>} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
