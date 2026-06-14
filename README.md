# UTC — Quotation & Pricing System (CPQ)

An internal **Configure-Price-Quote** web app for **United Trade Co. (UTC)** — *For Poultry Packaging & Equipment*.
UTC staff build customer quotes across all of UTC's brands (own brand, European agencies, Egyptian
suppliers), apply the correct pricing logic per line, and export a professional, UTC-branded PDF.

- **Frontend:** React + TypeScript + Vite + Tailwind CSS, bilingual **English / Arabic (RTL)**.
- **Backend:** **Supabase** — Postgres, Auth, Row-Level Security, Storage. No custom server.
- **Auth model:** company-email self-signup → new users land as **SALES**; **OWNER/ADMIN** are promoted manually.
- **PDF:** generated client-side (jsPDF), excludes all internal/commission data.

---

## 1. Prerequisites

- **Node.js 20+** and npm (this repo was built/verified on Node 26 / npm 11).
  Windows: install the LTS from <https://nodejs.org>. After installing, open a **new** terminal so
  `node` is on your PATH. Verify with `node -v`.
- A free **Supabase** project — <https://supabase.com> → *New project*.

> No Docker required. We use a **hosted** Supabase project (chosen during setup). If you later want a
> fully-local stack, install Docker Desktop + the Supabase CLI and run `supabase start`.

---

## 2. Set up the Supabase backend

### 2.1 Create the project
1. Create a new Supabase project; pick a region close to Cairo (e.g. *EU / Frankfurt*).
2. Wait for it to finish provisioning.

### 2.2 Apply the database schema + seed
You have two options — **either** is fine.

**Option A — one paste (simplest).**
Open **SQL Editor** in the Supabase dashboard, open the file
[`supabase/full_setup.sql`](supabase/full_setup.sql), paste the whole thing, and click **Run**.
This creates every table, enum, trigger, RLS policy, admin view, **and** loads the full brand/product
catalog + demo customers.

**Option B — CLI (versioned migrations).**
```bash
npm i -g supabase
supabase link --project-ref <your-project-ref>
supabase db push          # applies supabase/migrations/0001..0005
# then run the seed (psql connection string from Dashboard → Settings → Database):
psql "<connection-string>" -f supabase/seed.sql
```

The migrations live in [`supabase/migrations/`](supabase/migrations/) (numbered, reviewable):
`0001` schema · `0002` functions & triggers · `0003` RLS policies · `0004` admin views · `0005` constraints.

### 2.3 Create the first OWNER (promote snippet)
No one can self-assign OWNER/ADMIN — sign-ups are always SALES. So bootstrap the owner manually:

1. **Dashboard → Authentication → Users → Add user** → create your owner account (email + password).
   - For quick testing, tick *Auto Confirm User* so you don't need email confirmation.
2. The `handle_new_user` trigger automatically created a matching row in `public.profiles` (role `SALES`).
3. **SQL Editor → Run** this to promote that user (run with the built-in service role — the SQL editor
   already runs as a superuser, so RLS does not block it):

```sql
update public.profiles
set role = 'OWNER'
where email = 'you@yourcompany.com';   -- <-- the email you just created
```

Repeat with `role = 'ADMIN'` for finance/back-office users, or `role = 'SALES'` (the default) for sales staff.

### 2.4 (Optional) Lock signups to your company domain
By default the allow-list is **empty = any email may sign up** (handy for first-run testing).
To restrict it (Addendum A.2), run:

```sql
update public.app_config
set value = '["unitedtradeco.com"]'::jsonb      -- add as many domains as needed
where key = 'allowed_email_domains';
```

After this, signups from other domains are **rejected server-side** by the `handle_new_user` trigger.

### 2.5 Email confirmation (for testing)
New signups get a confirmation email by default. To turn it **off** while testing:
**Dashboard → Authentication → Providers → Email → disable "Confirm email"**. Turn it back on for production.

### 2.6 Storage (logo + PDFs) — optional for v1
The PDF is generated client-side and the logo is bundled in the app, so Storage isn't required to run.
If/when you want the buckets from Addendum A.9:
- Create a **public** bucket `branding/` and upload `logo.png`.
- Create a **private** bucket `quotes/` for archived PDFs (served via signed URLs).

---

## 3. Run the frontend

```bash
# from the project root
cp .env.example .env        # (Windows PowerShell: Copy-Item .env.example .env)
```

Edit `.env` and fill in the two values from **Dashboard → Project Settings → API**:

```
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon/public key>
```

Then:

```bash
npm install
npm run dev        # http://localhost:5173
```

> If `.env` is missing/blank, the app shows a clear "Supabase is not configured" screen instead of crashing.

Production build: `npm run build` → static files in `dist/` (deploy to any static host — Vercel, Netlify,
Cloudflare Pages, Supabase hosting, etc.).

---

## 4. Logging in & roles

| Role | Access |
|---|---|
| **OWNER** | Everything: all quotes & customers, catalog/price admin, admin overview, user roles. |
| **ADMIN / Finance** | All quotes & customers, edit catalog/prices/FX, admin overview. |
| **SALES** | Own quotes & customers only; read-only catalog & prices; no admin overview. |

There are **no seeded passwords** (Supabase Auth stores users securely; we never put credentials in SQL).
Create logins as in §2.3. A typical demo set: one OWNER, one ADMIN, one SALES.

RLS is the real security boundary: a SALES user querying another user's quote via the API **gets nothing**,
not just a hidden UI element.

---

## 5. How pricing works (quick tour)

Open **New Quote**:
1. Pick a customer (or create one inline). The quote currency defaults to the customer's preferred currency.
2. Set project, house type, currency, valid-until.
3. **Add product:** Brand → Product → (if the product has multiple pricing variants, e.g. Roxell
   *Warehouse per meter* vs *Agent per house*) choose the variant → enter quantity. The unit price is pulled
   from the current price list in the quote currency; if only another currency has a price, it's **converted
   via the FX table** and a small "↔ Converted" note is shown internally.
4. Edit any unit price manually if needed (e.g. a project price you were quoted directly).
5. Add installation lines where applicable.
6. The summary shows subtotal/total; **OWNER/ADMIN also see an internal commission estimate** (never on the PDF).
7. **Save** assigns the next `UTC-####` number. **Download PDF** produces the branded customer quote.

Three pricing modes are supported per line: **Warehouse** (UTC margin), **Agent/Commission** (supplier ships
direct, UTC tracks commission internally), and **Fixed-monthly** (Egyptian brands, EGP, effective-dated prices).
Prices are **effective-dated** — editing a price in the admin editor creates a **new** dated entry and closes
the old one, so **historical quotes never change** (each line snapshots its unit price).

---

## 6. Seeded catalog

13 active brands + 2 inactive placeholders, with their products and pricing variants, all with
**placeholder 0.00 prices** (enter real prices via **Admin → Catalog & Prices**):

- **Own:** UTC.stav.
- **European:** Roxell, Zucami, Skov, Pericoli, Hato, Multifan (+ *European Brand 8* & *9* — inactive TODOs).
- **Egyptian:** Tabreed, ELNILE, Falcon, Huhtamaki, EPEuropack.
- **FX rates** (EUR/USD/EGP) with editable starter values, plus 5 demo customers across ME/Africa.

---

## 6b. House Sizing & Auto-Calculation engine (Addenda B–F)

Inside the quote builder there's a **House Sizing & Auto-Calc** panel. Enter the house dimensions and a
few parameters, pick equipment models, and the engine sizes everything and proposes quote lines.

- **Formulas in code, constants in the DB.** Every constant (air speed, densities, spacings, coverage,
  pad face velocity, etc.) lives in the editable `calc_settings` table; equipment airflow/specs live in
  `fan_models`, `cooling_pad_models`, `heater_models`, `air_inlet_models`, `cage_models`. Edit them all in
  **Admin → Calc settings** — no developer needed. (Addendum B.0.)
- **Confirmed formulas** (Addendum C, superseding B): bird capacity (floor birds/m² default — broiler 15,
  layer/breeder 6 — with a weight-based option, plus the **caged Zucami** geometry from Addendum F that
  reproduces the real W-model offer: 90×13 m → 3,488 cages → 38,368 birds); feeding (width 11–13 → 3 lines,
  >13 → 4); drinking (4 / 5 lines, 15 nipples each); tunnel ventilation, cooling pads + PVC channels, side
  ventilation, air inlets (always both sides), recirculation fans, heaters. Each output shows the **formula
  with live numbers**, is **pre-filled and editable**, and is selectable before it's added to the quote.
- **Refuses to guess.** A fan/inlet model with no capacity set won't size — it warns you to enter the figure.
  Authoritative equipment capacities from supplier datasheets (Addendum D) are seeded (Pericoli EWS/EWD,
  Multifan 140, combiTERM E140, UTC/SKOV inlets, Zucami cages); `Pericoli ACF 21` airflow and the UTC.stav
  heater output are intentionally left blank for the client to fill.
- **Lighting** is estimate-only; enter the authoritative **HATO light-plan** outputs (lamps, rows, lux,
  uniformity) and they're stored on the quote.
- **Engineering BOQ report:** a UTC-branded PDF (House info → capacity → each system → full BOQ, every line
  with its formula) via **Download BOQ PDF** in the panel. Each generated quote line snapshots its calc inputs
  (`calc_source` / `calc_meta`) and the whole house spec is saved in `quote_calcs`.

To apply the engine to an **existing** Supabase project, paste
[`supabase/migrations/0006_calc_engine.sql`](supabase/migrations/0006_calc_engine.sql) into the SQL editor
(it only adds objects and is safe to re-run). Fresh installs get it automatically via `full_setup.sql`.

---

## 7. Open items / TODOs (carried from the PRD)

- [ ] **Enter real prices** for every product (all seeded at `0.00`) — Admin → Catalog & Prices.
- [ ] **European brands 8 & 9** — names / origin / products (currently inactive placeholder brands).
- [ ] **Aqua Maker** (UTC.stav) — confirm pricing unit & target house type (defaulted to `PER_UNIT` / `ALL`).
- [ ] **Logo:** drop the corrected logo `UTC_logo_correct.jpeg` into [`public/`](public/) (the app & PDF
      prefer it, then `logo.png`, then the labelled placeholder `public/logo.svg`). For the Storage flow,
      also upload to the `branding/` bucket.
- [ ] **Company email domain(s):** set the allow-list in `app_config` (§2.4) before going live.
- [ ] **Calc-engine client inputs (Addenda C.15 / D.8):** fan airflow for **Pericoli ACF 21**; the UTC.stav
      heater output/coverage; `bird_requirement_m3h_per_bird` (minimum ventilation per bird by age/weight —
      seeded default 4.0, confirm); confirm `effective_opening_height_m` source (per-quote vs setting);
      confirm default stocking density and heater coverage (25–30 m). Broiler `birds_per_cage` for the
      Zucami B1610 cage. All editable in **Admin → Calc settings**.
- [ ] **Deployment target** — undecided; the app is a static build + hosted Supabase, deployable anywhere.

---

## 8. Project structure

```
.
├─ index.html, vite.config.ts, tailwind.config.js, tsconfig*.json
├─ public/            logo.svg (placeholder), favicon.svg   ← drop logo.png here
├─ src/
│  ├─ lib/            supabase client, types, pricing/FX logic, formatting, PDF, data hooks
│  ├─ i18n/           en.json, ar.json, i18next init (RTL handling)
│  ├─ auth/           AuthProvider (session, profile, role)
│  ├─ components/     Layout, Guards, UI primitives, CustomerForm, LanguageToggle
│  └─ pages/          Login, Dashboard, BrandCatalog, Customers, CustomerDetail,
│                     QuotesList, QuoteEditor, AdminOverview, CatalogAdmin
└─ supabase/
   ├─ migrations/     0001..0005  (schema, triggers, RLS, views, constraints)
   ├─ seed.sql        full catalog + demo data (idempotent)
   └─ full_setup.sql  all of the above concatenated for one-paste setup
```

## 9. Notes & assumptions (where the PRD was silent)

- **PDF is rendered client-side** (Addendum A.8 "acceptable" path) — simplest to run, no Edge Function /
  service-role needed, and the browser only ever has data the user is already authorized to read. Commission
  and buy-side fields are never included. The optional Edge Function approach can be added later.
- **PDF labels are English** regardless of UI language, because reliable Arabic glyph shaping in jsPDF needs
  an embedded Arabic font; customer/project text you enter is rendered as-is.
- **Demo customers are seeded with no owner**, so they're visible to OWNER/ADMIN. Assign them to a salesperson
  by setting `customers.owner_user_id`, or just create fresh customers while logged in as that user.
- **Changing a quote's currency** re-resolves catalog-priced lines into the new currency (manually-edited and
  installation lines keep their amount). Saved historical quotes remain snapshotted and immutable.
- The PDF/jspdf bundle triggers Vite's "chunk > 500 kB" warning — harmless for an internal tool.

---

🤖 Built with [Claude Code](https://claude.com/claude-code).
