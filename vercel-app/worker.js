import { createClient } from '@supabase/supabase-js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function handleSendCampaign(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let payload
  try { payload = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { campaignId, contacts, lang, body_ar, body_en } = payload
  if (!campaignId || !contacts?.length) {
    return json({ error: 'Missing campaignId or contacts' }, 400)
  }

  const DO_RELAY_URL    = env.DO_RELAY_URL
  const DO_RELAY_SECRET = env.DO_RELAY_SECRET || ''

  if (!DO_RELAY_URL) return json({ error: 'DO_RELAY_URL not configured' }, 500)

  try {
    const relayRes = await fetch(DO_RELAY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Relay-Secret': DO_RELAY_SECRET },
      body:    JSON.stringify({ campaignId, contacts, lang, body_ar, body_en }),
    })

    let relayBody
    try { relayBody = await relayRes.json() } catch { relayBody = null }

    if (relayRes.status !== 202 && relayRes.status !== 200) {
      throw new Error(relayBody?.error || `Relay returned ${relayRes.status}`)
    }

    return json({ ok: true, campaignId }, 202)
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

async function handleCreateUser(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let payload
  try { payload = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { email, password, full_name, role } = payload
  if (!email || !password) return json({ error: 'Email and password required' }, 400)
  if (password.length < 8)  return json({ error: 'Password must be at least 8 characters' }, 400)

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)

  try {
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (authErr) throw authErr

    const { error: profErr } = await supabase.from('profiles').upsert({
      id:         authData.user.id,
      email,
      full_name:  full_name || '',
      role:       role || 'staff',
      active:     true,
      created_at: new Date().toISOString(),
    })
    if (profErr) throw profErr

    return json({ ok: true }, 201)
  } catch (e) {
    return json({ error: e.message }, 400)
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/send-campaign') return handleSendCampaign(request, env)
    if (url.pathname === '/api/create-user')   return handleCreateUser(request, env)

    return env.ASSETS.fetch(request)
  },
}
