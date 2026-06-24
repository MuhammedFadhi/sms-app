// api/send-campaign.js
// Vercel serverless function.
// Receives campaign payload from the frontend, fires a single POST
// to the DigitalOcean relay which handles the bulk loop async.
// Returns 202 immediately — DO updates Supabase as it sends.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // service key — NOT the anon key
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { campaignId, contacts, lang, body_ar, body_en } = req.body

  if (!campaignId || !contacts?.length) {
    return res.status(400).json({ error: 'Missing campaignId or contacts' })
  }

  const DO_RELAY_URL = process.env.DO_RELAY_URL  // e.g. https://<ip>/campaign
  if (!DO_RELAY_URL) return res.status(500).json({ error: 'DO_RELAY_URL not configured' })

  try {
    // Fire and forget — don't await the full send
    // DO will update Supabase directly as it processes
    const relayRes = await fetch(DO_RELAY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ campaignId, contacts, lang, body_ar, body_en }),
    })

    if (!relayRes.ok) {
      const d = await relayRes.json().catch(() => ({}))
      throw new Error(d.error || `DO relay returned ${relayRes.status}`)
    }

    return res.status(202).json({ ok: true, campaignId })
  } catch(e) {
    // Mark campaign as failed in Supabase
    await supabase.from('campaigns').update({ finished_at: new Date().toISOString(), failed: contacts.length }).eq('id', campaignId)
    return res.status(500).json({ error: e.message })
  }
}
