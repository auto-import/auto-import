# Production deployment foundation

This milestone defines a local-testable foundation for one Ubuntu VPS. It does not deploy anything, issue a real certificate, access production data, or configure a provider.

## Topology

Five services run continuously. Nginx is the only edge service and the only service that publishes host ports. The standalone Next.js frontend and NestJS backend are private. PostgreSQL stores relational data in `postgres_data`; private document and tenant-logo bytes use `private_documents`. Redis is an authenticated, non-public, ephemeral coordination service included in the required production foundation; the current application does not yet enqueue durable jobs, so Redis persistence and a worker container are deliberately absent. `migrate` is a one-shot deployment gate. `certbot` runs only under the `certificates` profile.

## Environment and first start

1. Copy `.env.production.example` to an untracked `.env.production` and replace every placeholder. URL-encode database credentials in `DATABASE_URL`.
2. Generate every application secret independently with `openssl rand -base64 48`. Generate PostgreSQL and Redis passwords independently as well.
3. Validate interpolation without starting containers:

   `docker compose --env-file .env.production -f docker-compose.production.yml config`

4. Build with `docker compose --env-file .env.production -f docker-compose.production.yml build`.
5. Obtain the first certificate before starting the TLS configuration. Run a temporary HTTP-only Nginx serving the `certbot_challenges` volume, then run `docker compose --profile certificates run --rm certbot certonly --webroot -w /var/www/certbot -d "$APP_DOMAIN"`. Stop the temporary listener and start the normal stack. Never use a self-signed certificate for a real deployment.
6. Start with `docker compose --env-file .env.production -f docker-compose.production.yml up -d`. The backend cannot start until the forward-only migration job succeeds.

The committed domain is intentionally invalid. DNS and a live certificate are staging/VPS prerequisites. Renewal uses `docker compose --profile certificates run --rm certbot renew`; schedule it twice daily and reload Nginx only after a successful renewal. Validate host configuration with `nginx -t` and run `certbot renew --dry-run` before enabling the schedule.

Production startup fails closed if database, CORS, public API, encryption, HMAC, private-storage, or trusted-proxy settings are missing, weak, relative, wildcarded, or non-HTTPS. Validation names variables but never prints their values. Mock call-center adapters and simulator routes are unavailable in production. SMTP, WhatsApp and telephony remain disabled until real adapters and provider data are supplied.

There is intentionally no automatic seed. A fresh migrated database has no organization, user, demo business row, provider channel, or credential. After migrations, use the one-time bootstrap below while the public edge is stopped. It refuses any database that already contains an organization or user, creates all canonical permissions and one tenant-scoped Admin role atomically, reads the password only from a locked-down file, hashes it with bcrypt, and records a redacted audit event. It never creates demo data or a known password.

1. Have a second operator confirm the database name and approved organization/admin identity. Create a unique 20–128 character password in a password manager, write only that value to `/root/auto-import-bootstrap-password`, and run `chmod 600 /root/auto-import-bootstrap-password`.
2. Export the non-secret identity inputs in the operator shell: `BOOTSTRAP_ORGANIZATION_NAME`, `BOOTSTRAP_ADMIN_FIRST_NAME`, `BOOTSTRAP_ADMIN_LAST_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and the exact confirmation `BOOTSTRAP_CONFIRM=CREATE_INITIAL_ADMIN:<POSTGRES_DB>`.
3. Run the one-shot migration image with the password file mounted read-only: `docker compose --env-file .env.production -f docker-compose.production.yml run --rm -v /root/auto-import-bootstrap-password:/run/secrets/bootstrap-password:ro -e BOOTSTRAP_ORGANIZATION_NAME -e BOOTSTRAP_ADMIN_FIRST_NAME -e BOOTSTRAP_ADMIN_LAST_NAME -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_CONFIRM -e BOOTSTRAP_PASSWORD_FILE=/run/secrets/bootstrap-password migrate npm run bootstrap:admin`.
4. Confirm the command reports one organization/user identifier, sign in through HTTPS, rotate the password, verify the Admin role and tenant branding controls, then securely delete the password file and clear the five exported bootstrap variables from shell history/session. Re-running the command must fail closed. Never run `seed:demo` or edit these records manually in production.

## Backup and restore

The scripts require PostgreSQL client tools, GNU tar/coreutils and GPG. Use a dedicated OS account and a GPG public recipient whose private key is stored off-host. `backup.sh` refuses to run until application writes are paused and `BACKUP_MAINTENANCE_CONFIRMED=yes` is set. It creates a custom-format database dump, document archive, per-document checksums, JSON manifest and encrypted checksum list. Only encrypted artifacts enter the final backup directory.

`BACKUP_OFFSITE_COMMAND` may point to an executable wrapper that accepts one backup-directory argument and uploads it with `rclone copy` or an S3-compatible client. The wrapper owns provider-specific configuration; no provider credentials belong in this repository. A local VPS copy is not an off-site backup.

Verify with `deploy/scripts/verify-backup.sh /absolute/path/backup-<UTC timestamp>`. Restore only into a disposable or explicitly approved target by setting `TARGET_DATABASE_URL`, `TARGET_STORAGE_ROOT`, and the exact confirmation `RESTORE:<database-name>:<absolute-storage-path>`, then run `deploy/scripts/restore.sh <backup-directory>`. The restore refuses broad paths, verifies encryption/checksums/archive listings first, cleans only the named target, restores the database, extracts bytes, and rechecks every document checksum.

The systemd examples are templates only. Before installing them, create a locked-down environment file, a least-privilege user, validated writable paths, a maintenance-window mechanism, failure alerts, and a tested off-site hook.

## Operational checks

Check `/health`, `/ping`, the frontend `/connexion`, PostgreSQL `pg_isready`, Redis authenticated `PING`, HTTPS redirect, and authenticated Socket.IO connections for both `/notifications` and `/call-center`. Restart the stack and prove database rows, a tenant logo and a private document persist. Perform an encrypted restore drill into a separately named database and storage directory after every material backup change.

### Cross-device login check

The public browser bundle must use same-origin endpoints. Keep the frontend build arguments at `NEXT_PUBLIC_API_BASE_URL=/api` and `NEXT_PUBLIC_REALTIME_URL=/call-center`; never build a VPS image with either value pointing to `localhost`, because `localhost` would refer to each visitor's own computer or phone. Set `APP_DOMAIN` to the hostname only, and set both `CORS_ORIGIN=https://<APP_DOMAIN>` and `PUBLIC_API_BASE_URL=https://<APP_DOMAIN>/api`.

After every frontend rebuild, test from a private/incognito window on a second device. In browser developer tools, login must call `https://<APP_DOMAIN>/api/auth/login`, the response must set the `auto_import_refresh` cookie with `Secure`, `HttpOnly`, `SameSite=Lax`, and subsequent `/api/auth/refresh` requests must return HTTP 200. A request to `localhost`, an HTTP public URL, a missing refresh cookie, or a CORS error indicates a deployment configuration failure rather than invalid user credentials.
