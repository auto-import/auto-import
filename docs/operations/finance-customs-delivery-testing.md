# Finance, customs and delivery operations testing

Use only a disposable local/staging database and private-storage root. Never run the demo seeder or destructive scenarios against production.

## Roles and permissions

- Admin: settings and integration administration, users/roles, all test visibility.
- Finance: `finance:read`, payment/invoice/payment-plan permissions, including confirm/reverse where assigned.
- Logistics: dossier, vehicle, shipment, customs and document read/write permissions.
- Sales: client/dossier/document access required for contract onboarding.
- Restricted persona: read-only permissions used to prove mutation and integration controls return `403`.

## Canonical workflow differences

- CIF: `offerSelected` → `clientConfirmed` → `contractSigned` → deposit/purchase/supplier/inspection/booking/loading/B-L/transit → `arrivedAtPort` → `documentsDelivered` → `closed`. Arrival evidence applies; customs, port-exit and local-transport checkpoints are not in this workflow.
- DDP: follows the sale flow through `arrivedAtPort`, then `customsClearance` → `customsReleased` → `portExit` → `localTransport` → `deliveredToClient` → `closed`. Arrival, customs, port-exit and local-transport evidence each apply per vehicle.
- Shipping-only: `clientRegistered` → external vehicle/supplier → pickup/quote/payment/booking/loading/container B-L/transit → `arrived` → `serviceCompleted`. Sale-contract and the four DDP/CIF checkpoint gates do not apply.

## Finance procedure

1. Create and issue an invoice, then create either a 30/70 or full-upfront plan.
2. Record a payment with a unique idempotency key and explicit invoice/installment allocation.
3. Confirm it. Reconciliation updates active allocations, invoice/installment status, the dossier Finance summary, organization Finance summary and persistent notifications. Payment never advances dossier operations automatically.
4. For 30/70, confirm the first installment before the explicit purchase transition and the complete plan before final document/delivery transitions. Full-upfront requires the complete amount at the purchase gate.
5. Reverse with a reason. Active allocations become reversed, invoice/installment totals are recomputed, deposits are reversed, and any no-longer-satisfied gate locks again.
6. Verify partial, paid, overdue, overpaid/deposit and reversed states after reload. Currency tests must use a persisted effective exchange rate; never assume a rate.

Negative checks: pending payments do not unlock gates; unallocated overpayment is a deposit rather than invoice payment; a repeated idempotency key cannot create a second payment; cross-tenant IDs return not found.

## Shipping and customs procedure

Create the shipment through the existing Expeditions workspace/API and follow only offered status transitions. For DDP, create the customs file, attach the required private documents and record inspection/clearance/release using its canonical history. CIF stops after documents are delivered; shipping-only uses `arrived` and has no DDP customs chain.

Before explicitly entering `arrivedAtPort`, upload an `ARRIVAL_AT_PORT` photo for every dossier vehicle. Before `customsClearance`, `portExit`, or `localTransport`, do the same for `CUSTOMS`, `PORT_EXIT`, or `LOCAL_TRANSPORT`. Gallery images do not count. Missing bytes, a bad checksum, a wrong vehicle/dossier/tenant, or a generic photo must return a conflict and leave status unchanged.

## Contract and delivery procedure

Upload a real PDF/JPEG/PNG as `CONTRACT` / `SIGNED_CONTRACT`; drafts and filenames containing “signed” do not count. Enter `contractSigned` explicitly after the integrity check succeeds. For DDP delivery, complete port exit and local transport evidence, settle the final finance gate, then use the offered client-delivery transition. Evidence already relied on is retained; replacement creates history and does not delete relied bytes.

## Safe scenarios and expected results

- Use the deterministic Atlas admin, Finance and Logistics personas documented in `docs/demo-database-seeding.md`; use the restricted persona for `403` checks and Sahara for tenant isolation.
- Run pristine migration, seed twice, verify file checksums, and use a new browser profile on task-owned ports.
- Expected positive result: explicit transitions succeed only after correct files/payments; reload shows identical PostgreSQL state.
- Expected negative result: each missing contract/photo/payment produces its stable gate code and no status change.
- Simulator calls/messages remain local and persistent. Provider-live tests are `NOT RUN` until a provider, official API/event mapping and authorized credentials are supplied.
