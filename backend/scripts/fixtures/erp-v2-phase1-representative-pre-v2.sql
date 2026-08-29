-- TEST FIXTURE ONLY. Apply solely to a disposable database that has migrations
-- through 20260827010000_tenant_branding and not the Phase 1 migration.
BEGIN;

INSERT INTO "Organization" (id, name, type, status, "createdAt", "updatedAt") VALUES
  ('phase1-org-a', 'Phase 1 Fixture A', 'company', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('phase1-org-b', 'Phase 1 Fixture B', 'company', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "User" (id, "organizationId", "firstName", "lastName", email, "passwordHash", status, locale, "createdAt", "updatedAt") VALUES
  ('phase1-user-a', 'phase1-org-a', 'Agent', 'Fixture A', 'phase1-a@example.invalid', 'not-a-real-password-hash', 'active', 'fr', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('phase1-user-b', 'phase1-org-b', 'Agent', 'Fixture B', 'phase1-b@example.invalid', 'not-a-real-password-hash', 'active', 'fr', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Prospect" (
  id, "organizationId", "firstName", "lastName", phone, source, status,
  qualification, "assignedTo", "convertedAt", "createdAt", "updatedAt"
) VALUES
  ('phase1-lead-new', 'phase1-org-a', 'Nouveau', 'Canal', '0550 12 34 56', 'INBOUND_CALL', 'new', 'WARM', 'phase1-user-a', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('phase1-lead-lost', 'phase1-org-a', 'Statut', 'Perdu', '+213 551 111 111', 'FACEBOOK', 'lost', 'COLD', 'phase1-user-a', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('phase1-lead-amb-a', 'phase1-org-a', 'Partage', 'Un', '0552 22 22 22', 'MANUAL', 'contacted', 'HOT', 'phase1-user-a', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('phase1-lead-amb-b', 'phase1-org-a', 'Partage', 'Deux', '+213552222222', 'WHATSAPP', 'qualified', 'WARM', 'phase1-user-a', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('phase1-lead-converted', 'phase1-org-a', 'Déjà', 'Converti', '0553 33 33 33', 'REFERRAL', 'converted', 'HOT', 'phase1-user-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('phase1-lead-tenant-b', 'phase1-org-b', 'Autre', 'Tenant', '0550 12 34 56', 'WEBSITE', 'new', 'UNCLASSIFIED', 'phase1-user-b', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Client" (
  id, "organizationId", "prospectId", "firstName", "lastName", phone, email,
  nationality, status, "assignedTo", "createdAt", "updatedAt"
) VALUES
  ('phase1-client-converted', 'phase1-org-a', 'phase1-lead-converted', 'Déjà', 'Converti', '+213553333333', 'converted@example.invalid', 'DZA', 'active', 'phase1-user-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('phase1-client-amb', 'phase1-org-a', NULL, 'Partage', 'Client', '00213 552 222 222', NULL, 'France', 'active', 'phase1-user-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "ContactPoint" (
  id, "organizationId", kind, "displayValue", "normalizedValue",
  "whatsappEnabled", "prospectId", "clientId", preferred, verified,
  "createdAt", "updatedAt"
) VALUES
  ('phase1-contact-new', 'phase1-org-a', 'PHONE', '0550 12 34 56', '+213550123456', true, 'phase1-lead-new', NULL, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('phase1-contact-tenant-b', 'phase1-org-b', 'PHONE', '0550 12 34 56', '+213550123456', true, 'phase1-lead-tenant-b', NULL, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

COMMIT;
