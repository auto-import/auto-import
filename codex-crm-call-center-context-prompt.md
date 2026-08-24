# Codex Task — Implement the CRM and Omnichannel Call Center

## Role and authorization

You are implementing the highest-priority CRM and Call Center milestone in the existing Auto-Import ERP repository. This request authorizes in-scope local code changes, additive data-safe migrations, and non-destructive validation.

This is an implementation task. Do not stop after analysis or produce another repository audit.

## Token and time budget rules

The repository was already audited and the Foundation milestone was already implemented and validated. Use the architecture and paths in this prompt as the starting point.

- Do not scan or summarize the whole repository.
- Do not regenerate a full architecture map.
- Do not inspect unrelated vehicle, offer, dossier, order, finance, shipping, customs, partner, warehouse, document, or reporting modules.
- Do not run broad discovery commands such as an unrestricted recursive file dump.
- Before coding, read the repository instructions if present, then inspect only the targeted files listed below.
- If a listed path moved, use one targeted `rg --files` or `rg` query to find its replacement.
- Reuse the completed Foundation contracts, authentication, tenant isolation, API client, UI patterns, and test setup.
- Do not run full builds after each subtask. Use targeted tests while coding and full relevant validation once at the end.
- Do not clean the unrelated legacy backend lint baseline. New and changed production files must lint clean.
- Do not reinstall dependencies unless a genuinely required dependency is absent.
- Give short progress updates only when moving between backend schema/domain work, provider/realtime work, frontend integration, and final validation.

## Known repository architecture

Repository root:

```text
auto-import/
├── backend/                       NestJS 11 + Prisma + PostgreSQL
├── frontend/                      Next.js 16.3 + React 19.2 App Router
├── shared/
│   └── contracts/
│       └── index.js               Canonical types, statuses and permissions
└── docs/
    └── api-contract.md            Canonical API contract
```

### Known backend structure

```text
backend/
├── prisma/
│   ├── schema.prisma              Authoritative database schema
│   ├── seed.ts                    Deterministic dev/test-only seed
│   └── migrations/
│       ├── ...                    Earlier migrations
│       ├── 20260824140000_canonical_contract_statuses/
│       └── 20260824150000_foundation_identity_tenant_relations/
├── scripts/
│   └── verify-prisma-foundation.ps1
└── src/
    ├── main.ts                    /api prefix, CORS, validation, interceptors
    ├── app.module.ts              Root module registration
    ├── common/
    │   ├── decorators/            CurrentUser, Public, RequirePermission
    │   ├── guards/                JWT and permission guards
    │   ├── interceptors/          Response envelope and logging
    │   └── filters/               Canonical HTTP error format
    ├── auth/                      Completed secure login/session/refresh/logout
    ├── users/                     Completed tenant-safe user administration
    ├── roles/                     Completed protected tenant role CRUD
    ├── permissions/               Canonical permission checks
    ├── offices/                   Completed tenant-safe Office CRUD
    ├── prospects/                 Existing partial CRM implementation
    ├── clients/                   Existing partial client implementation
    ├── dossiers/                  Do not modify beyond optional read-only CRM links
    ├── vehicles/                  Out of scope
    ├── warehouses/                Out of scope
    ├── vehicle-requests/          Out of scope
    ├── orders/                    Out of scope
    └── partners/                  Out of scope
```

The original audit found:

- Prospects already have CRUD, activities, and conversion endpoints, but the backend model is poorer than the frontend lead model.
- Prospect operations originally used incorrect client permissions; Foundation canonicalized permission resources.
- `Prospect.assignedTo` and activity user references were originally uncontrolled strings; Foundation added tenant-safe assignee relations. Verify the current schema instead of recreating them.
- Clients originally supported list/detail/update/delete and related dossier/order reads, but direct creation and rich CRM aggregates were missing.
- Task, NotificationTemplate, Notification, and AuditLog Prisma models existed, but no complete HTTP modules existed.
- Calls, call events, call transfers, presence, WhatsApp conversations/messages, appointments, contact points, and provider webhooks did not exist as complete domains.

### Known frontend structure

```text
frontend/
├── app/
│   └── (dashboard)/
│       ├── page.tsx                       Existing dashboard; out of scope
│       ├── crm/
│       │   ├── page.tsx                   Redirects to /crm/leads
│       │   ├── leads/page.tsx             Mock lead Kanban
│       │   └── clients/
│       │       ├── page.tsx               Mock CRM client list/KPIs
│       │       └── [id]/page.tsx           Mock client aggregate/timeline
│       ├── clients/page.tsx               Legacy mock client route
│       ├── utilisateurs/page.tsx          Already integrated; use as API/UI example
│       └── notifications/page.tsx          Currently mock; implement CRM minimum only
├── components/
│   ├── AuthProvider.tsx                   Completed real authentication
│   ├── UsersAdministration.tsx            Completed API-integrated UI example
│   ├── LeadFormModal.tsx                  Existing mock lead form
│   ├── LeadDetailModal.tsx                Existing mock lead activity/conversion UI
│   ├── Topbar.tsx                         Current-user and notifications location
│   └── ...                                Preserve existing design components
├── lib/
│   ├── api.ts                             Completed authenticated HTTP client
│   ├── api-contract.ts                    Typed envelope/pagination/status mappings
│   └── mockData.ts                        Remove only CRM/call-center consumers
└── types/
    └── index.ts                           Existing French UI types; replace CRM API values
```

The frontend uses French labels and should keep them. API/domain values are canonical English camelCase or shared contract values. Do not send French snake_case fields to the backend.

## Completed Foundation — do not redo

The following is already implemented and validated:

- Canonical shared domain contracts and permissions.
- Standard success/error/pagination envelopes.
- Swagger at `/api/docs`.
- Safe backend/frontend `.env.example` files.
- Type-specific dossier initialization.
- Reconciled Prisma migrations, tenant indexes, relations, and deterministic seed.
- Secure opaque refresh sessions with hashed tokens, rotation, revocation, HttpOnly cookies, `/auth/me`, `/auth/session`, login and logout.
- Frontend authenticated API client with in-memory access token, single-flight refresh, and one retry.
- Real login, route protection, 401/403 behavior, and no mock-user fallback.
- Tenant-safe RBAC, users, roles, permissions, and offices.
- `/utilisateurs` uses real APIs.

Foundation validation already passed:

- backend unit tests: 100/100;
- frontend tests: 12/12;
- backend E2E: 1/1;
- backend and frontend TypeScript;
- backend and frontend production builds;
- Prisma fresh migration, diff, generate, and deterministic seed;
- live authentication, admin, limited-role, and browser smoke tests.

Do not spend time revalidating these before CRM work. Run regression validation once at the end.

## Product outcome

Implement a real, database-backed CRM and omnichannel Call Center where:

- leads and clients are assigned to responsible agents;
- the company receives calls on configured business numbers;
- an incoming call is matched to a client/lead by normalized phone number;
- an unknown number automatically creates exactly one lead;
- the call appears live in the call-center queue and on agent dashboards;
- a dispatcher sees available/busy/away/offline employees and assigns or transfers the call;
- dispatcher and handling employee are tracked separately;
- after the call, the handling employee records outcome, notes, lead status, qualification, and next action;
- inbound WhatsApp messages use the same identity-resolution flow;
- every lead/client has one chronological timeline containing calls, WhatsApp, notes, follow-ups, appointments, status changes, assignments, and next actions;
- agent and employee KPIs are calculated from authoritative database events.

User-facing French/Arabic requirements:

> Chaque lead/client doit avoir une timeline contenant les appels, WhatsApp, notes, relances, rendez-vous et la prochaine action. La liste des leads affiche la source, l'agent, le statut, la dernière interaction, la prochaine relance et la qualification Hot/Warm/Cold.
>
> Le module Call Center contient les appels entrants, la file d'attente, les agents disponibles/occupés, les appels manqués, les callbacks et l'historique. Lorsqu'un appel arrive, un numéro connu ouvre la fiche client; un numéro inconnu crée automatiquement un lead. Après chaque appel, l'employé saisit le résultat et la prochaine action.
>
> Le dashboard par agent affiche les appels, appels manqués, durées, leads qualifiés, rendez-vous et conversions.

## Provider decision and current boundary

The actual VoIP and WhatsApp providers have not been chosen.

Implement the complete provider-neutral core now:

- provider interfaces;
- capability metadata;
- durable/idempotent webhook ingestion;
- development/test simulators;
- configuration placeholders;
- real-time UI;
- all CRM, queue, assignment, outcome, timeline, task, notification, and KPI behavior.

Do not claim real external calling, call transfer, WhatsApp delivery, or provider presence until a real adapter is later implemented.

Do not browse provider documentation or implement Asterisk, FreePBX, 3CX, Twilio, Meta, or another provider in this milestone.

## Targeted initial reads

Read only these items initially, in parallel where independent:

### Backend

1. `backend/prisma/schema.prisma`
2. `backend/src/app.module.ts`
3. `backend/src/prospects/prospects.module.ts`
4. `backend/src/prospects/prospects.controller.ts`
5. `backend/src/prospects/prospects.service.ts`
6. `backend/src/prospects/dto/**`
7. `backend/src/clients/clients.module.ts`
8. `backend/src/clients/clients.controller.ts`
9. `backend/src/clients/clients.service.ts`
10. `backend/src/clients/dto/**`
11. The exact Foundation permission constants and CurrentUser pattern used by the completed user/office controllers.
12. Existing Task/Notification/AuditLog model definitions in `schema.prisma`; locate services only if they now exist.

### Frontend

1. `frontend/lib/api.ts`
2. `frontend/lib/api-contract.ts`
3. `frontend/app/(dashboard)/crm/leads/page.tsx`
4. `frontend/app/(dashboard)/crm/clients/page.tsx`
5. `frontend/app/(dashboard)/crm/clients/[id]/page.tsx`
6. `frontend/app/(dashboard)/clients/page.tsx`
7. `frontend/components/LeadFormModal.tsx`
8. `frontend/components/LeadDetailModal.tsx`
9. `frontend/components/UsersAdministration.tsx` only as the established integration/state-pattern example.
10. The CRM-related types and CRM-related sections of `frontend/lib/mockData.ts`; do not read unrelated offer/dossier/finance/shipping mock sections.
11. The sidebar/navigation component only when adding `/crm/call-center`.

After these reads, implement directly. Inspect an additional file only when a concrete import, type, relation, or test requires it.

## Intended backend organization

Preserve existing `prospects/` and `clients/` modules. Do not move or rewrite working Foundation modules.

Use the following organization unless an existing repository convention makes a small variation clearly better:

```text
backend/src/
├── prospects/
│   ├── prospects.module.ts
│   ├── prospects.controller.ts
│   ├── prospects.service.ts
│   ├── dto/
│   └── *.spec.ts
├── clients/
│   ├── clients.module.ts
│   ├── clients.controller.ts
│   ├── clients.service.ts
│   ├── dto/
│   └── *.spec.ts
├── crm/
│   ├── crm.module.ts
│   ├── crm.controller.ts             Timeline, queues, CRM aggregates
│   ├── crm-timeline.service.ts
│   ├── contact-resolution.service.ts
│   ├── crm-kpi.service.ts
│   ├── dto/
│   └── *.spec.ts
├── call-center/
│   ├── call-center.module.ts
│   ├── calls.controller.ts
│   ├── whatsapp.controller.ts
│   ├── call-center.controller.ts     Queue, presence, assignment, KPI
│   ├── provider-webhooks.controller.ts
│   ├── simulator.controller.ts       Development/test only
│   ├── call-routing.service.ts
│   ├── call-session.service.ts
│   ├── agent-presence.service.ts
│   ├── whatsapp.service.ts
│   ├── webhook-inbox.service.ts
│   ├── call-center.gateway.ts        Authenticated real-time events
│   ├── providers/
│   │   ├── telephony-provider.interface.ts
│   │   ├── messaging-provider.interface.ts
│   │   ├── provider-registry.service.ts
│   │   ├── mock-telephony.provider.ts
│   │   └── mock-whatsapp.provider.ts
│   ├── dto/
│   └── *.spec.ts
├── tasks/                             CRM follow-up functionality
├── appointments/                      CRM appointment functionality
├── notifications/                     In-app CRM notifications
└── audit/                             Reuse existing model; minimum safe API/event support
```

Do not create empty architectural layers. Combine small files when that better matches current NestJS conventions, but keep provider-specific code isolated from CRM business services.

## Intended frontend organization

Preserve existing pages and visual design. Suggested organization:

```text
frontend/
├── app/(dashboard)/crm/
│   ├── page.tsx
│   ├── leads/page.tsx
│   ├── clients/page.tsx
│   ├── clients/[id]/page.tsx
│   └── call-center/page.tsx
├── components/crm/
│   ├── LeadFormModal.tsx             Reuse/move only if safe
│   ├── LeadDetailModal.tsx           Reuse/move only if safe
│   ├── LeadPipeline.tsx
│   ├── UnifiedTimeline.tsx
│   ├── CallScreenPop.tsx
│   ├── CallQueue.tsx
│   ├── AgentPresenceBoard.tsx
│   ├── CallDispositionForm.tsx
│   ├── WhatsAppInbox.tsx
│   ├── FollowUpQueue.tsx
│   └── AgentKpiCards.tsx
├── lib/
│   ├── api.ts                        Existing authenticated client; reuse
│   ├── api-contract.ts               Existing contracts; extend safely
│   ├── crm-api.ts
│   ├── call-center-api.ts
│   └── call-center-realtime.ts
└── types/
    └── index.ts                      Keep UI labels separate from API values
```

Do not move existing components merely to match this tree if doing so adds churn. The required result is clear ownership and no CRM mock dependency.

## Canonical CRM data requirements

### Contact identity

Create a canonical tenant-scoped contact identity rather than matching raw strings independently across prospects and clients.

Recommended `ContactPoint` behavior:

- `organizationId`;
- kind such as PHONE or EMAIL;
- original display value;
- normalized value;
- phone normalized to E.164, including Algerian `+213` input variants;
- WhatsApp capability flag for phone identities;
- optional `prospectId` or `clientId`, with a database constraint requiring exactly one owner;
- preferred and verified flags;
- unique `(organizationId, kind, normalizedValue)` constraint.

During prospect-to-client conversion, move/reassign contact points in the same transaction. Two simultaneous inbound events for an unknown number must create exactly one lead.

Backfill existing Prospect/Client phone/email values with an additive migration. If duplicates make ownership ambiguous, do not guess or delete them. Make the migration abort with a precise conflict report or use a safe staged constraint.

### Lead/prospect

The lead must support:

- source;
- responsible agent relation;
- canonical pipeline status and validated transitions;
- qualification: HOT, WARM, COLD, UNCLASSIFIED;
- last interaction time derived from authoritative events;
- next open follow-up/action;
- creation from an inbound call or WhatsApp message;
- loss/win/conversion history;
- idempotent conversion to exactly one Client.

Retain French display labels in the frontend.

### Unified timeline

Expose one stable cursor-paginated chronological timeline for a prospect or client. It combines without duplicating:

- calls and call state events;
- WhatsApp messages and delivery states;
- CRM activities;
- notes;
- follow-ups/tasks;
- appointments;
- status changes;
- assignment/transfer history;
- next actions.

Use `occurredAt` plus a stable ID as ordering keys. Do not copy every event into a second denormalized timeline table unless a measured query requirement justifies it.

## Call-center models and state

Use the current Prisma conventions, but implement equivalent concepts:

### CompanyChannel

- organization;
- channel: VOICE or WHATSAPP;
- company number in normalized form;
- provider key;
- active state;
- queue/routing configuration;
- no secret/API key stored in the database unless encrypted secret management already exists.

### CallSession

- organization and provider;
- provider call ID with tenant/provider uniqueness;
- INBOUND/OUTBOUND direction;
- company number and external number;
- matched prospect or client;
- dispatcher/call-center agent;
- handling employee;
- state: RINGING, QUEUED, ASSIGNED, FORWARDED, ANSWERED, COMPLETED, MISSED, FAILED;
- received, queued, answered, completed timestamps;
- calculated duration and waiting time;
- outcome/result;
- notes;
- next action;
- missed/failure reason;
- optional recording FileAsset only when a real authorized file exists.

Dispatcher and handling employee are different roles and must remain separately reportable.

### CallAssignment or CallTransfer

- call;
- dispatcher;
- from/to employee where applicable;
- requested, accepted, rejected, or failed status;
- timestamps and reason;
- append-only history for routing accountability.

### AgentPresence

- user;
- AVAILABLE, BUSY, AWAY, OFFLINE;
- MANUAL or PROVIDER source;
- current call when busy;
- last update/heartbeat;
- a stale heartbeat must not leave an employee permanently available.

Until a real provider is selected, support authenticated manual presence and simulator-generated presence events.

### WhatsAppConversation and Message

- organization/provider/provider IDs;
- company channel;
- matched prospect/client;
- responsible agent;
- INBOUND/OUTBOUND direction;
- content type and text;
- optional authorized FileAsset for media;
- received/sent/delivered/read/failed timestamps;
- reply/context relationship;
- idempotency and provider status-event handling.

### Follow-ups and appointments

Use the existing Task model where appropriate rather than creating a competing follow-up table.

A scheduled callback must create or update exactly one linked follow-up task transactionally. Support today, overdue, upcoming, completed, and cancelled queues.

Appointments need responsible employee, prospect/client, scheduled start/end, status, notes, and outcome. Creating an appointment should update the next-action view and relevant KPIs.

### WebhookInbox/EventReceipt

- organization resolved from the configured company channel, never caller-supplied;
- provider and provider event ID;
- event type;
- safe payload hash/metadata;
- received, processing, processed, failed state;
- retry count and last safe error;
- unique idempotency constraint;
- retention policy.

Webhook endpoints are public only at the JWT layer. They must authenticate by provider signature once a real adapter exists. The mock simulator must be development/test-only and unavailable in production.

## Provider interfaces

Implement provider-neutral interfaces with capability discovery.

`TelephonyProvider` must cover the concepts needed for:

- webhook verification/parsing;
- normalized call events;
- call transfer when supported;
- hangup/reject when supported;
- provider presence when supported;
- provider health/capabilities.

`MessagingProvider` must cover:

- webhook verification/parsing;
- inbound messages and delivery/read status events;
- send text;
- send template;
- send media when supported;
- provider health/capabilities.

Implement `MockTelephonyProvider` and `MockWhatsAppProvider` with deterministic simulator endpoints/scripts. Simulated outbound actions must be visibly labeled simulated and must never be reported as externally delivered.

Configuration should anticipate environment variables similar to:

```text
TELEPHONY_PROVIDER=mock
TELEPHONY_WEBHOOK_SECRET=
TELEPHONY_API_BASE_URL=
TELEPHONY_API_KEY=
WHATSAPP_PROVIDER=mock
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
PUBLIC_WEBHOOK_BASE_URL=
```

Add names only to `.env.example`; never add real values or log secrets.

## Exact inbound call behavior

Implement this state/data flow:

1. Receive provider event on a configured company voice channel.
2. Persist/deduplicate the event receipt.
3. Normalize the external phone number.
4. Resolve the ContactPoint inside the channel organization.
5. If no contact exists, transactionally create one Prospect and ContactPoint with source `INBOUND_CALL`.
6. Create/update the CallSession idempotently.
7. Put the call into the configured queue.
8. Notify authorized dispatcher agents in real time.
9. Show a screen pop with existing client/lead data or the new lead.
10. Show eligible employee presence.
11. Allow the dispatcher to claim/assign/transfer the call.
12. Record routing history and keep dispatcher/handler identities separate.
13. Apply normalized provider/simulator state events.
14. When answered, mark the handler busy.
15. When ended, release presence and require the handler disposition form.
16. Save outcome, notes, qualification, lead status, next action, callback, or appointment.
17. Update the timeline, tasks, notifications, and KPIs from authoritative records.

Unknown-contact creation and event retries must be concurrency-safe.

## Exact WhatsApp behavior

1. Receive a verified/simulated inbound message on a configured WhatsApp channel.
2. Deduplicate the provider event/message ID.
3. Resolve the sender using the same normalized ContactPoint identity.
4. If unknown, create exactly one Prospect with source `WHATSAPP`.
5. Create or reuse the conversation.
6. Persist the message and notify the responsible/eligible agent in real time.
7. Show the conversation beside the lead/client profile and unified timeline.
8. Allow a simulated outbound reply through the provider interface.
9. Apply simulated/real provider delivery state transitions idempotently.
10. Allow follow-up/appointment/next-action creation from the conversation.

## Frontend behavior

### `/crm/leads`

Replace mock reads/mutations. Preserve the Kanban and add:

- source;
- assigned agent;
- pipeline status;
- last interaction;
- next follow-up/action;
- HOT/WARM/COLD qualification;
- search and filters;
- real create/update/assignment/status/conversion actions.

### `/crm/clients` and `/crm/clients/[id]`

Use real client APIs. Provide the unified timeline and available CRM aggregates. Do not fake dossier, vehicle, revenue, payment, or balance values when their authoritative domains are not yet integrated.

Resolve the duplicate legacy `/clients` route by redirecting it to the canonical CRM client list or integrating it intentionally. Do not maintain two conflicting client implementations.

### `/crm/call-center`

Implement:

- incoming-call screen pop;
- waiting queue;
- active calls;
- available/busy/away/offline employees;
- assignment/transfer actions;
- missed calls;
- callbacks and overdue follow-ups;
- WhatsApp inbox;
- recent call/message history;
- lead/client context;
- disposition and next-action form;
- agent KPI filters/cards.

### Real-time behavior

Use an authenticated NestJS WebSocket gateway or an existing repository real-time pattern. Authorize the connection and join only permitted organization/user rooms.

Real-time events are hints, not the sole source of truth. On reconnect, the frontend must reload current queue, presence, notifications, and conversations through REST APIs.

### Error and state behavior

Implement loading, empty, validation, conflict, forbidden, offline/reconnect, and server-error states. Do not fall back to mock data when an API fails.

## Permissions

Add canonical permissions matching the shared contract style, including the smallest useful set for:

- prospects and clients;
- CRM timeline/notes;
- call-center access;
- queue dispatch;
- handling calls;
- WhatsApp handling;
- follow-up/appointment management;
- own-agent KPI viewing;
- organization-wide KPI viewing;
- channel/provider administration.

Backend authorization is authoritative. Frontend visibility is only a usability layer.

Agents must not read another organization’s channels, contacts, clients, prospects, calls, messages, users, tasks, appointments, notifications, or KPI aggregates.

## KPI definitions

Calculate from database records, with tenant/date/agent filters:

### Dispatcher KPIs

- calls received into queues;
- calls dispatched;
- average dispatch delay;
- missed/unassigned calls;
- successful/failed transfer attempts.

### Handling employee KPIs

- answered calls;
- missed assigned calls;
- answer rate;
- total and average talk duration;
- average waiting/answer time;
- WhatsApp conversations/messages handled;
- first-response time;
- callbacks completed/overdue;
- qualified leads;
- appointments created/completed;
- lead conversions and conversion rate.

Define denominator and time-zone behavior explicitly. Avoid double-counting retries, transfers, or the same call handled by multiple people.

## Required APIs

Use the canonical response envelope and pagination contract. Exact route grouping may follow current conventions, but cover:

- prospect/client CRUD, filters, assignment, transition, conversion;
- activities/notes;
- unified timelines;
- company channel configuration;
- inbound webhook/simulator events;
- call queue/list/detail/state/history;
- call assignment/transfer/disposition;
- presence/heartbeat/list;
- WhatsApp conversations/messages/replies;
- follow-up queues and task actions;
- appointment CRUD/status;
- notification list/unread/read;
- CRM/call-center KPIs.

Swagger must describe implemented routes and DTOs. Do not document provider capabilities that the mock adapter does not actually support.

## Tests and executable demonstration

Implement tests before completion for:

1. Known client inbound call:
   - event → contact match → queue → notification → dispatch → answer → completion → disposition → timeline/KPI.

2. Unknown caller:
   - event → exactly one lead/contact → queue → assignment → qualification/next action.

3. Concurrent duplicate unknown caller events:
   - exactly one Prospect and ContactPoint.

4. Replayed provider event:
   - no duplicate call, lead, message, task, notification, timeline item, or KPI count.

5. Missed call:
   - queue timeout/end event → missed state → callback task → responsible-agent notification.

6. Presence:
   - available → busy on answer → available after completion;
   - stale heartbeat becomes offline/away according to the defined rule.

7. Transfer:
   - dispatcher and handling employee remain separately attributable;
   - invalid/cross-tenant transfer fails without existence disclosure.

8. WhatsApp known and unknown senders:
   - resolution/creation, conversation, simulated reply, delivery transitions, timeline.

9. Lead lifecycle:
   - create, filter, assign, transition, activity, qualify, idempotent conversion, contact-point reassignment.

10. Timeline:
   - stable ordering/pagination and authorization.

11. KPI fixtures:
   - independently calculated expected dispatcher/employee values.

12. Frontend:
   - API loading/error/empty states;
   - lead actions;
   - call screen pop/queue;
   - presence/assignment;
   - disposition;
   - WhatsApp inbox;
   - reconnect state recovery.

13. Browser smoke using simulators:
   - log in;
   - simulate a known call;
   - dispatch and complete it;
   - simulate an unknown WhatsApp sender;
   - confirm automatic lead and timeline;
   - reload and confirm persistence.

## Validation budget

During implementation:

- run only targeted tests for the current service/component;
- lint changed production files only;
- use one disposable database for migration/integration checks;
- do not repeatedly run both production builds.

At the end, run once:

- Prisma validate/generate and fresh migration verification;
- all CRM/call-center backend tests;
- relevant security/E2E tests;
- all frontend CRM/call-center tests;
- backend and frontend TypeScript checks;
- backend and frontend production builds;
- `git diff --check`;
- one simulator-backed browser smoke.

If an unrelated legacy global-lint baseline remains, report its unchanged count only if already cheaply available. Do not spend this milestone fixing it.

## Success criteria

Before stopping, all of the following must be true:

- CRM and Call Center use PostgreSQL end to end.
- `/crm/leads`, `/crm/clients`, `/crm/clients/[id]`, and `/crm/call-center` do not consume CRM mock data.
- Known numbers open the correct prospect/client.
- Unknown call/WhatsApp numbers create exactly one lead.
- Queue, presence, dispatch, transfer simulation, missed calls, callbacks, outcomes, appointments, and next actions persist.
- Dispatcher and handling-employee attribution remain separate.
- Calls, WhatsApp, notes, follow-ups, appointments, status changes, assignments, and next actions appear in one timeline.
- Real-time updates work and reconnect restores state from the API.
- Agent/dispatcher KPIs reconcile with test fixtures.
- Provider-specific behavior is isolated behind interfaces.
- Simulator endpoints are impossible to use in production.
- New/changed production files lint clean.
- Relevant tests, type checks, migrations, builds, and browser smoke pass.

## Stop rules and final response

Continue autonomously through schema, backend, provider simulators, realtime, frontend, and validation.

Stop early only if:

- a migration cannot safely resolve ambiguous existing contact ownership without a user decision;
- a required local dependency cannot be installed or accessed;
- a concrete repository state contradicts a critical assumption in this prompt and proceeding would cause data loss.

Do not stop because the real providers are unselected; the mock adapters are the required completion path for this milestone.

Return one concise completion report containing only:

1. models/migration created;
2. backend modules/routes and realtime events;
3. frontend routes/components integrated;
4. mock CRM dependencies removed;
5. simulator scenarios demonstrated;
6. validation commands/results;
7. exact environment variables and adapter work remaining after providers are selected;
8. concrete blockers, if any.

Do not repeat the repository architecture or this prompt in the final report.
