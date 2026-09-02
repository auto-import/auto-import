-- Simplify CRM Lead status workflow: Nouveau -> Contacté -> Qualifié -> Rendez-vous -> Converti
-- Remove CONTRACT/DEPOSIT from Lead CRM lifecycle; migrate existing records to APPOINTMENT (Rendez-vous).
-- This migration is SAFE / ADDITIVE / DATA-PRESERVING: no rows deleted, no destructive enum changes (crmStatus is TEXT).
-- Scope: ONLY Prospect.crmStatus / ProspectStatusHistory (Lead CRM). Contracts, Payments, Finance, Dossier untouched.

-- 1) Migrate existing Prospect rows that use removed statuses.
UPDATE "Prospect"
SET "crmStatus" = 'APPOINTMENT',
    "status" = 'qualified',
    "updatedAt" = now()
WHERE "crmStatus" IN ('CONTRACT', 'DEPOSIT');

-- 2) Migrate ProspectStatusHistory entries for Lead CRM (history text). Keep audit but normalize removed statuses.
UPDATE "ProspectStatusHistory"
SET "toStatus" = 'APPOINTMENT'
WHERE "toStatus" IN ('CONTRACT', 'DEPOSIT');

UPDATE "ProspectStatusHistory"
SET "fromStatus" = 'APPOINTMENT'
WHERE "fromStatus" IN ('CONTRACT', 'DEPOSIT');
