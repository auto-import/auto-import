# ERP V2 Phase 1 — CRM Leads and Clients operations

The authoritative pre-deployment, deployment, smoke-test, backup, and rollback
instructions are now the Linux/Docker Compose runbook:

- [`erp-v2-phase-1-linux-staging-runbook.md`](erp-v2-phase-1-linux-staging-runbook.md)

The former Windows PowerShell examples have been removed. Phase 1 remains
expansion-first: no legacy CRM column or business row is removed, ambiguous
phones are never merged automatically, and `FileAsset` remains the existing
passport-file authority until the separately approved Phase 2 GED migration.
