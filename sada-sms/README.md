# SA'DA H2O — SMS Marketing Platform v2

**Architecture:** Vercel (frontend + API) → DigitalOcean (bulk send relay) → Taqnyat

---

## Stack

| Layer | What |
|---|---|
| Frontend | React + Vite, deployed on Vercel |
| API | Vercel serverless functions (`/api/`) |
| Database | Supabase (Postgres) |
| SMS relay | Node.js HTTPS server on DigitalOcean droplet |
| SMS gateway | Taqnyat |

---

## How it works

```
Browser → Vercel app
           ├─ Reads/writes data → Supabase
           └─ On Send Campaign → Vercel API → POST /campaign → DO relay
                                                                  ├─ Loops contacts
                                                                  ├─ Calls Taqnyat one by one
                                                                  └─ Writes logs → Supabase directly
```

The DO relay responds `202` immediately. The bulk loop runs in the background on DO. Vercel's timeout is never hit.

---

## Sender IDs

| Endpoint | Sender | Used for |
|---|---|---|
| `POST /campaign` (DO) | `SADA.Co-AD` | Marketing campaigns from the platform |
| `POST /send` (DO) | `SADA.co` | Legacy relay — existing apps, unchanged |

---

## Setup — Step by step

### 1. Supabase

1. Create account at [supabase.com](https://supabase.com)
2. New project — name it `sada-sms`
3. Go to **SQL Editor** → paste entire contents of `supabase-schema.sql` → Run
4. Go to **Settings → API**, copy:
   - Project URL
   - `anon` public key
   - `service_role` key (keep secret)
5. Go to **Authentication → Settings**:
   - Disable "Enable email confirmations" (internal tool, no need)

### 2. Create your admin user

In Supabase → **Authentication → Users** → **Add user**:
- Email: your email
- Password: strong password
- Click "Create user"

Then in **SQL Editor** run:
```sql
update public.profiles set role = 'admin' where email = 'your@email.com';
```

### 3. DigitalOcean relay

SSH into your droplet:
```bash
ssh root@<YOUR_DO_IP>
```

Upload `do-relay/server.js` and `do-relay/deploy-relay.sh` to the server, then:
```bash
chmod +x deploy-relay.sh
./deploy-relay.sh
```

Edit the `.env`:
```bash
nano /root/sms-relay/.env
```
Fill in `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `RELAY_SECRET`, then:
```bash
pm2 restart sms-relay
```

### 4. Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
3. **Root directory:** `vercel-app`
4. **Framework preset:** Vite
5. Add environment variables (from `.env.example`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `DO_RELAY_URL` → `https://<YOUR_DO_IP>/campaign`
   - `DO_RELAY_SECRET` → same value as `RELAY_SECRET` in DO `.env`
6. Deploy

### 5. Done

Open your Vercel URL, sign in with the admin credentials you created in Supabase.

---

## Updating

### Frontend / UI change
Push to GitHub → Vercel auto-deploys in ~30 seconds.

### DO relay change
```bash
scp do-relay/server.js root@<DO_IP>:/root/sms-relay/server.js
ssh root@<DO_IP> pm2 restart sms-relay
```

---

## Project structure

```
sada-sms/
├── vercel-app/
│   ├── src/
│   │   ├── pages/          Dashboard, Templates, Contacts, Compose, Reports, Users, Login
│   │   ├── components/     Sidebar, Topbar, Modal
│   │   ├── App.jsx         Router + auth context
│   │   ├── supabase.js     Supabase client
│   │   ├── index.css       Design system
│   │   └── main.jsx
│   ├── api/
│   │   ├── send-campaign.js  Triggers DO relay
│   │   └── create-user.js    Creates Supabase auth users
│   ├── index.html
│   ├── vite.config.js
│   ├── vercel.json
│   └── package.json
├── do-relay/
│   ├── server.js           HTTPS relay — /send (legacy) + /campaign (bulk)
│   └── deploy-relay.sh
├── supabase-schema.sql     Run once in Supabase SQL editor
├── .env.example            Environment variable reference
└── README.md
```

---

## PM2 commands (on DO)

```bash
pm2 status                   # check relay is running
pm2 logs sms-relay           # live logs
pm2 restart sms-relay        # after any .env or server.js change
```
