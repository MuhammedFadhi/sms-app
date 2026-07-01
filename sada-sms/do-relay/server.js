'use strict';
const https   = require('https');
const fs      = require('fs');
const crypto  = require('crypto');

const TAQNYAT_TOKEN   = process.env.TAQNYAT_TOKEN  || '91a952e3a8a20842b6ac9c139bf04a38';
const TAQNYAT_SENDER  = process.env.TAQNYAT_SENDER || 'SADA.Co-AD';
const RELAY_SENDER    = process.env.RELAY_SENDER   || 'SADA.co';
const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_KEY;
const RELAY_SECRET    = process.env.RELAY_SECRET   || '';
const PORT            = 443;
const BATCH_SIZE      = 50;
const BATCH_DELAY_MS  = 1200;
const COST_PER_SMS    = 0.06;
const SSL_KEY         = process.env.SSL_KEY  || '/root/sms-relay/key.pem';
const SSL_CERT        = process.env.SSL_CERT || '/root/sms-relay/cert.pem';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normMobile(m) {
  let n = String(m).replace(/\D/g, '');
  if (n.startsWith('00966')) n = n.slice(2);
  if (n.startsWith('0'))     n = '966' + n.slice(1);
  if (!n.startsWith('966'))  n = '966' + n;
  return n;
}

function buildMessage(body_ar, body_en, lang, contact) {
  let msg = lang === 'ar' ? body_ar
          : lang === 'en' ? body_en
          : [body_ar, body_en].filter(Boolean).join('\n\n');
  return msg
    .replace(/\{\{name\}\}/g, contact.name || 'عميلنا الكريم')
    .replace(/\{\{city\}\}/g, contact.city || '')
    .trim();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 10e6) reject(new Error('Body too large')); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function jsonRes(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

async function callTaqnyat(sender, mobile, message) {
  const r = await fetch('https://api.taqnyat.sa/v1/messages', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${TAQNYAT_TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ sender, recipients: [mobile], body: message }),
  });
  const data = await r.json();
  const ok   = r.status === 200 || r.status === 201 || data?.statusCode === 201;
  return { ok, msgId: data?.messages?.[0]?.messageId || '' };
}

async function supabaseInsertLog(log) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/send_logs`, {
    method:  'POST',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(log),
  }).catch(() => {});
}

async function supabaseUpdateCampaign(id, delivered, failed, cost) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/campaigns?id=eq.${id}`, {
    method:  'PATCH',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ delivered, failed, cost, finished_at: new Date().toISOString() }),
  }).catch(() => {});
}

async function runCampaign({ campaignId, contacts, lang, body_ar, body_en }) {
  let delivered = 0, failed = 0;
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    for (const contact of batch) {
      try {
        const mobile  = normMobile(contact.mobile);
        const message = buildMessage(body_ar || '', body_en || '', lang || 'both', contact);
        const { ok, msgId } = await callTaqnyat(TAQNYAT_SENDER, mobile, message);
        await supabaseInsertLog({
          id: crypto.randomUUID(), campaign_id: campaignId,
          contact_id: contact.id || '', mobile, name: contact.name || '',
          status: ok ? 'delivered' : 'failed', taqnyat_id: msgId,
          sent_at: new Date().toISOString(),
        });
        if (ok) delivered++; else failed++;
      } catch(e) {
        await supabaseInsertLog({
          id: crypto.randomUUID(), campaign_id: campaignId,
          contact_id: contact.id || '', mobile: contact.mobile || '', name: contact.name || '',
          status: 'error', taqnyat_id: '', sent_at: new Date().toISOString(),
        });
        failed++;
      }
    }
    if (i + BATCH_SIZE < contacts.length) await sleep(BATCH_DELAY_MS);
  }
  const smsPerContact = lang === 'both' ? 2 : 1;
  const cost = parseFloat((delivered * smsPerContact * COST_PER_SMS).toFixed(2));
  await supabaseUpdateCampaign(campaignId, delivered, failed, cost);
  console.log(`Campaign ${campaignId} done -- ${delivered} delivered, ${failed} failed, SAR ${cost}`);
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Relay-Secret');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST')    { jsonRes(res, 405, { error: 'Method not allowed' }); return; }

  if (RELAY_SECRET && req.url === '/campaign') {
    const provided = req.headers['x-relay-secret'] || '';
    if (provided !== RELAY_SECRET) { jsonRes(res, 401, { error: 'Unauthorized' }); return; }
  }

  try {
    const body = await readBody(req);

    if (req.url === '/send' || req.url === '/') {
      const { to, body: smsBody } = body;
      if (!to || !smsBody) { jsonRes(res, 400, { error: 'Missing to or body' }); return; }
      const { ok, msgId } = await callTaqnyat(RELAY_SENDER, normMobile(to), smsBody);
      jsonRes(res, 200, { ok, msgId });
      return;
    }

    if (req.url === '/campaign') {
      const { campaignId, contacts, lang, body_ar, body_en } = body;
      if (!campaignId || !contacts?.length) {
        jsonRes(res, 400, { error: 'Missing campaignId or contacts' });
        return;
      }
      jsonRes(res, 202, { ok: true, queued: contacts.length });
      runCampaign({ campaignId, contacts, lang, body_ar, body_en })
        .catch(e => console.error('Campaign error:', e.message));
      return;
    }

    if (req.url === '/health') {
      jsonRes(res, 200, { ok: true, ts: new Date().toISOString() });
      return;
    }

    jsonRes(res, 404, { error: 'Not found' });
  } catch(e) {
    console.error('Handler error:', e.message);
    jsonRes(res, 500, { error: e.message });
  }
}

const sslOptions = {
  key:  fs.readFileSync(SSL_KEY),
  cert: fs.readFileSync(SSL_CERT),
};

https.createServer(sslOptions, handler).listen(PORT, () => {
  console.log("SA'DA H2O relay running on HTTPS port " + PORT);
  console.log('Campaign sender: ' + TAQNYAT_SENDER);
  console.log('Relay sender:    ' + RELAY_SENDER);
  console.log('Supabase:        ' + (SUPABASE_URL ? 'connected' : 'NOT configured'));
});
