// api/create-user.js
// Creates a new Supabase auth user + profile row.
// Must use SUPABASE_SERVICE_KEY (admin privileges).

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, password, full_name, role } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  if (password.length < 8)  return res.status(400).json({ error: 'Password must be at least 8 characters' })

  try {
    // Create the auth user
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,  // skip email verification for internal tool
    })
    if (authErr) throw authErr

    // Upsert profile
    const { error: profErr } = await supabase.from('profiles').upsert({
      id:         authData.user.id,
      email,
      full_name:  full_name || '',
      role:       role || 'staff',
      active:     true,
      created_at: new Date().toISOString(),
    })
    if (profErr) throw profErr

    return res.status(201).json({ ok: true })
  } catch(e) {
    return res.status(400).json({ error: e.message })
  }
}
