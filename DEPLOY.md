# Running Mdawra in production

How the live system is put together, how to release a change, how to check it is healthy, and what to do when it is not.
Secrets (database password, Tap keys, JWT secret) are never written here or in chat: they live only in Render's
Environment page and in `backend/.env` on a developer's own computer.

## What runs where

| Piece | Where | Address |
| --- | --- | --- |
| Customer website and admin | Vercel, project **frontend** | https://www.madawarah.com (Mudawarah), https://khobztmaraei.com (Khobzt Marie) |
| API | Render web service **Mudawwrah-website**: Singapore, Starter, 1 GB disk | https://mudawwrah-website.onrender.com (`/api/health`, `/api/version`) |
| Database | Supabase project `svyywyoknpocdksdbheh`: Tokyo, session pooler on port 5432, Pool Size 25 | |
| Uploaded pictures | The Render disk (`/var/data/uploads`); shown through the website's `/uploads/...` address, which Vercel's `api/image.js` fetches from the API | Vercel variable `UPSTREAM_API_URL` |
| Online payments | Tap, switched on per restaurant (see below) | |
| Receipt printing | One "print station" page per branch computer (Admin → Printing) | |

The API used to run on a laptop behind a temporary tunnel, and an older Render service called `mdawra-api` still exists.
Neither is part of the system any more; if they are still running, switch them off (see "Retiring the old setup").

## Releasing a change

1. Open a pull request into `devin/1784920877-mdawra-ordering-platform`. The CI checks (lint, tests, build, and every
   migration on an empty database) must pass.
2. **Merge it.** Render deploys the server by itself from that branch: the build applies any new migration, then
   starts the new version. Wait until the service shows **Live** (about 2 minutes; the API restarts for a few seconds).
3. **Website** (only if the website changed): from the `frontend` folder, with everything committed:
   ```
   XDG_DATA_HOME="/c/Users/Administrator/AppData/Roaming/xdg.data" npm run deploy
   ```
   It refuses uncommitted changes, stamps the commit into the build, reads `/version.json` back from the live address,
   and also prints which commit the server is running. If a change needs both, the server line must show the same commit
   before anyone says it is live.
4. Tell the client only what has been verified live. A change is not fixed until it has been seen working on the real site.

**Order matters when a change needs both:** server first, then the website. A website that calls something the server does
not have yet shows errors until the server catches up.

## Is it healthy?

```
curl https://mudawwrah-website.onrender.com/api/health          # {"status":"ok"}
curl https://mudawwrah-website.onrender.com/api/version         # which commit the server runs
curl https://www.madawarah.com/version.json                      # which commit the website runs
cd backend && node scripts/branch-status.mjs                     # per branch: newest order, last accepted, waiting, locked addresses
```

`/api/my-address` tells anyone the address the server sees for them (used to fix a branch's address lock).

In the admin, the **Dashboard** shows which branch screens are connected, and every page shows a banner while orders wait
to be accepted (amber, then red after 5 minutes, then pulsing after 15; the chime repeats until they are accepted).

### Alerts when nobody is looking (set up once)

In October 2026 orders went unaccepted for two days before anyone noticed. A free uptime monitor (UptimeRobot,
Better Stack, ...) checking every 5 minutes and alerting the owner by email, SMS or app closes that gap:

| Monitor | Address | Alerts when |
| --- | --- | --- |
| Server up | `https://mudawwrah-website.onrender.com/api/health` | it does not answer 200 |
| Orders accepted | `https://mudawwrah-website.onrender.com/api/health/orders?tenant=mdawra` | it answers 503: an order has waited 15+ minutes unaccepted |
| Website up | `https://www.madawarah.com/version.json` | it does not answer 200 |

The orders check says only ok or not ok, never order details. Add one per restaurant (`?tenant=khobzt-marie`, ...).

### Deploys without a gap

Render → the service → **Settings → Health Check Path** must be `/api/health`. Render then keeps the old server
answering until the new one is healthy; without it, every deploy shows visitors a few seconds of "502".

## Server settings (Render → Environment)

The full list, with the reason for each, is in [`render.yaml`](render.yaml). The ones that matter in an emergency:

| Setting | Notes |
| --- | --- |
| `DATABASE_URL` / `DIRECT_URL` | Supabase **session pooler**, port 5432. Never the transaction pooler (6543). |
| `connection_limit` (inside `DATABASE_URL`) | Every server using the database shares one pool (Supabase → Database → Pool Size, now 25). The limits of all servers together must stay below it, or customers see "max clients reached". Render uses 3 while another server is still running, 10 once it is the only one. |
| `JWT_SECRET` | Never change it casually: it logs everyone out and changes every printer link. |
| `PUBLIC_URL` | The storefront address (`https://www.madawarah.com`), not the API's. |
| `API_URL` | The API's own address; payment gateways call back to it. |
| `ONLINE_PAYMENT_TENANTS`, `ONLINE_PAYMENT_PILOT_PHONES` | Which restaurants, and during testing which phones, are sent to the payment page. |
| `NODE_ENV` | `production`: the server then refuses to start with a development secret or an open CORS list. |
| `CORS_ORIGINS` | Only the restaurants' own addresses. No `*.vercel.app`: that would let any site hosted on Vercel call the API. Staff use `www.madawarah.com/admin`, never a Vercel preview link. |
| `WHATSAPP_APP_SECRET` | Without it, WhatsApp webhooks are refused (nothing can prove they come from Meta). |

## Branch accounts and the address lock

A branch login (`ardiya@madawarah.com`) only sees its own branch's orders. Each branch can also be locked to its own
internet addresses (Admin → Settings → Branches → the branch → Allowed IPs), checked on every request. When a branch's line changes
address, its screen is refused. To fix it:

1. On the branch computer open `https://mudawwrah-website.onrender.com/api/my-address` and read `address`.
2. Add that address to the branch (IPv4 exactly; IPv6 only needs the same `/64`).
3. The check re-reads within a minute.

To see what a branch is doing, run the branch status script above. To lift the lock temporarily, in Supabase's SQL editor
(first check the project name, top left): `update "PickupLocation" set "allowedIps" = '{}' where "nameEn" = 'Al Ardiya';`
and put the addresses back afterwards. Without the lock, anyone with the branch password can sign in from anywhere.

## Automatic printing

Each branch computer keeps one page open next to its receipt printer; new orders print by themselves. Setup is on
**Admin → Printing** (a private link and a Windows shortcut per branch; Chrome with `--kiosk-printing`, the receipt
printer as the Windows default). An online-paid order prints only after payment is confirmed, an order from before
printing existed never prints, and a lost ticket is sent again with "Send to printer" on the order.

## Taking Tap payments live (Mudawarah only)

1. Render → Environment: `PAYMENT_PROVIDER=tap`, `TAP_SECRET_KEY` (the **test** key first), `ONLINE_PAYMENT_TENANTS=mdawra`,
   `ONLINE_PAYMENT_PILOT_PHONES=<a test phone>`, `API_URL`, `STOREFRONT_URL`. Only the pilot phones go to the payment page.
2. Test with Tap's test cards (paid, refused, cancelled) and check each order's payment status and method in the admin.
3. Swap in the **live** key, make one real payment of a small amount with a pilot phone, and refund it from Tap's dashboard.
4. Clear `ONLINE_PAYMENT_PILOT_PHONES` to open it to every customer. The client then regenerates the live key.

A paid order that is later cancelled shows **Refund needed** in the admin. Tap's refunds are made in Tap's dashboard.

## Retiring the old setup

Once the API on Render has been the only one serving customers for a day: stop the backend and the `cloudflared` tunnel on the
old computer, suspend the old `mdawra-api` Render service, then raise the Render `connection_limit` back to 10.

## Rules that prevent the incidents we have had

- Never run `npm run db:setup`, `db:reset`, or the seed against the live database: they can erase real orders.
- Before running any SQL in Supabase, read the project name at the top: the same account holds other projects.
- Never paste a key, token or password into chat or a commit. If one was, regenerate it.
- Never test payments with the live key before the pilot-phone step above.
- The Free Render plan sleeps and has no disk; do not downgrade the service to save money without moving the pictures first.

## Setting up a copy from scratch (staging, or a new restaurant group)

1. **Supabase**: create a project (Singapore is closest to Render Singapore). Connect → **Session pooler** → copy the address
   (port 5432) with the database password filled in. Set Pool Size under Project Settings → Database.
2. **Render**: New → Web Service from this repository, with the settings in [`render.yaml`](render.yaml) (or a Blueprint from it).
   Add `DATABASE_URL` (with `connection_limit`), `DIRECT_URL`, `JWT_SECRET`, `API_URL` and the rest from that file.
   The first build creates the schema (`prisma migrate deploy`). For an empty database only, run `node prisma/seed.js` once.
3. **Vercel**: import the repository with Root Directory `frontend`; set `VITE_API_URL` (the Render address plus `/api`) in
   `frontend/.env.production`, and `UPSTREAM_API_URL` (the Render address, no `/api`) in the project's variables.
4. Add each restaurant's domain in Vercel and register it in the platform console so the API can tell which restaurant a
   visitor belongs to (list `www.` and the bare domain, both).
