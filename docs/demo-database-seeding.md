# Safe ERP demo database

The normal Prisma seed remains the minimal bootstrap for permissions and the local bootstrap administrator. The separate demo seed adds stable, recognizable records for two fictional tenants without deleting or changing non-demo business rows.

## Safety and configuration

Use a brand-new local PostgreSQL database created specifically for this task. Its name must match `codex_demo_[a-z0-9_]+`. The seeder refuses remote hosts, production-like database names, `NODE_ENV` values other than `development`/`test`, missing opt-in, and unsafe storage roots. The private storage path must be absolute and its final directory name must start with `.codex-demo-storage-`.

Set these server-only variables in the shell; do not put a real demo password in a tracked file:

```powershell
$env:NODE_ENV='development'
$env:ALLOW_DEMO_SEED='true'
$env:DEMO_SEED_SCALE='small'
$env:DEMO_SEED_ANCHOR_DATE='2026-08-25T12:00:00.000Z'
$env:DEMO_SEED_PASSWORD='1234567890123'
$env:DATABASE_URL='postgresql://USER:PASSWORD@localhost:PORT/codex_demo_local'
$env:DEMO_FILE_STORAGE_ROOT='C:\absolute\path\.codex-demo-storage-local'
$env:PRIVATE_STORAGE_ROOT=$env:DEMO_FILE_STORAGE_ROOT
```

Deploy migrations and bootstrap permissions before demo data:

```powershell
npx prisma migrate deploy
npx prisma db seed
npm run seed:demo
npm run seed:demo:verify
```

Running `npm run seed:demo` again is supported: deterministic IDs, references, provider IDs, idempotency keys, notification keys and fixture paths make it idempotent. `small` is the documented default. `medium` adds CRM leads while preserving the same scenarios. The anchor date controls overdue/upcoming records and twelve-month finance history.

## Demo identities

Every identity uses the one password supplied in `DEMO_SEED_PASSWORD`; it is never printed. Primary Atlas tenant:

- `admin@demo.auto-import.invalid` — Admin
- `manager@demo.auto-import.invalid` — Manager
- `commercial@demo.auto-import.invalid` — Commercial
- `call@demo.auto-import.invalid` — Call Center
- `finance@demo.auto-import.invalid` — Finance
- `logistics@demo.auto-import.invalid` — Logistics
- `readonly@demo.auto-import.invalid` — Read-only
- `inactive@demo.auto-import.invalid` — inactive Commercial filter fixture

Secondary Sahara isolation tenant:

- `secondary-admin@demo.auto-import.invalid` — Admin
- `secondary-readonly@demo.auto-import.invalid` — Read-only

## Scenarios

The Atlas tenant drives nonzero Dashboard and Reports KPIs, all lead lifecycle/temperature filters, simulator-only call and WhatsApp states, supplier/warehouse/stock views, vehicles and China-offer reservation states, CIF/DDP/shipping dossier histories, blocked and ready gate banners, invoice/payment-plan/payment/deposit reconciliation, margin variants, shipment/customs timelines, every supported document kind, and due/read/audit operational views. Sahara contains a deliberately small independent client, vehicle, order, dossier, invoice, file, task and notification set for tenant-isolation checks.

The verification command is read-only. It checks tenant relations, canonical workflow history, quantities, money and allocation totals, exchange-rate timing, margin coverage, shipment/customs chronology, private bytes/checksums/sizes, document categories, notification deduplication, audit redaction, and stable references. It exits nonzero on any failure.
