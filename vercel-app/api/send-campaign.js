// api/send-campaign.js
// Vercel serverless function — CommonJS
// Forwards campaign payload to DigitalOcean relay.
// Uses http.request directly to bypass self-signed cert rejection.

const https = require('https')

function postToRelay(url, body, secret) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url)
    const payload = JSON.stringify(body)
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-Relay-Secret': secret || '',
      },
      rejectUnauthorized: false,  // allow self-signed cert on DO
    }
    const req = https.request(options, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { campaignId, contacts, lang, body_ar, body_en } = req.body

  if (!campaignId || !contacts?.length) {
    return res.status(400).json({ error: 'Missing campaignId or contacts' })
  }

  const DO_RELAY_URL    = process.env.DO_RELAY_URL
  const DO_RELAY_SECRET = process.env.DO_RELAY_SECRET || ''

  if (!DO_RELAY_URL) {
    return res.status(500).json({ error: 'DO_RELAY_URL not configured' })
  }

  try {
    const { status, body: relayBody } = await postToRelay(
      DO_RELAY_URL,
      { campaignId, contacts, lang, body_ar, body_en },
      DO_RELAY_SECRET
    )

    if (status !== 202 && status !== 200) {
      throw new Error(relayBody?.error || `Relay returned ${status}`)
    }

    return res.status(202).json({ ok: true, campaignId })
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
