# Auto-Import API contract

The published domain values live in the local `@auto-import/contracts` package
at `contracts/`. Backend validation and frontend API code must import that
package; database and UI-only models must not redefine API enum values.

## Naming and values

- JSON fields use English `camelCase`.
- Dossier types are `VEHICLE_SALE_CIF`, `VEHICLE_SALE_DDP`, and
  `SHIPPING_ONLY`.
- Status values are English `camelCase` values from the shared package.
- French text belongs in frontend label maps such as
  `frontend/lib/api-contract.ts` and is never sent as an API status value.
- Permissions use `<resource>:<action>`. Both parts are case-sensitive; the
  canonical values are `Permission` and `ALL_PERMISSIONS` in the shared
  package. `vehicleRequests` is the canonical resource spelling.

## Successful responses

Every successful controller response is wrapped once:

```json
{
  "success": true,
  "data": {},
  "timestamp": "2026-08-24T12:00:00.000Z",
  "path": "/api/dossiers",
  "statusCode": 200
}
```

List endpoint data has one shape:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

Page numbers are one-based. `limit` defaults to 20 and may not exceed 100.

## Error responses

Errors are never placed inside the success envelope:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": ["status must be one of the following values: draft, confirmed"]
  },
  "timestamp": "2026-08-24T12:00:00.000Z",
  "path": "/api/orders/example/status",
  "statusCode": 400
}
```

`details` is optional and contains safe, user-actionable validation details.
Unexpected errors always use `INTERNAL_SERVER_ERROR` and do not expose a stack
or internal exception message.

## OpenAPI

When the backend is running, Swagger UI is served at `/api/docs` and its JSON
document at `/api/docs-json`. Protected operations declare the named
`access-token` HTTP bearer scheme. The document is generated only from current
controllers and DTOs.

## Compatibility and migration

Migration `20260824140000_canonical_contract_statuses` converts legacy French
dossier status identifiers and snake-case vehicle transit statuses. The backend
can normalize legacy dossier values while an upgrade is in progress, but new
requests reject them. The old hard-coded dossier statistics buckets were
removed; statistics now group by stored canonical status and dossier type.
