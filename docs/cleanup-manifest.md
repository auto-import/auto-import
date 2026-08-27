# Cleanup manifest

Inventory was taken before deletion. No repository-wide clean, broad recursive target, production path, external volume or uncertain environment file is in scope.

| Candidate | Classification and ownership | Decision |
| --- | --- | --- |
| `.codex-demo-storage-run/` | Ignored disposable demo storage created by this local validation run | Deleted after final browser validation |
| PostgreSQL databases `codex_demo_run`, `codex_i18n_fresh` in local `auto-import-db` | Disposable demo and empty migration-test databases created by this run | Dropped after final validation |
| `backend/dist/`, `frontend/.next/`, `frontend/.next-i18n-uat/`, `frontend/tsconfig.tsbuildinfo` | Ignored/generated build output recreated by validation | Task output deleted; an already-running, uncertain-ownership frontend process recreated `frontend/.next/`, so that live cache was retained rather than stopping the process |
| `.codex-production-browser-profile/`, `.codex-production-browser-artifacts/` | Task-owned headless-browser profile and temporary evidence | Deleted after final browser validation |
| Docker Compose project `codex_i18n_prod`, its four Compose volumes, three restore-drill volumes, networks, self-signed certificate and restore-drill data | Disposable local production-topology validation owned by this run | Containers, networks and all seven volumes removed after validation |
| Docker images tagged `codex_i18n_prod-*` or `auto-import-production-*` | Production images built by this run | All fifteen task-owned tags removed after build and environment-exclusion validation |
| `.codex-demo-storage-live/`, `.codex-demo-storage-local/` | Ignored local runtime data with uncertain ownership | Retain |
| PostgreSQL databases `codex_demo_live`, `codex_demo_local` | Existing local databases with uncertain ownership | Retain |
| `.codex-browser-artifacts-ui-polish/`, `.codex-demo-storage-ui-polish/` | Prior-task artifacts whose deletion ownership is not certain in this milestone | Retain |
| `backend/.env`, `frontend/.env.local` | Existing untracked/ignored environment configuration of uncertain ownership | Retain and never print values |
| Prompt Markdown files and existing source/test/reference files | User work or required repository content | Retain |

The application does not seed at image build, migration, container start or health check. Development/demo seed commands remain explicit tooling and are not invoked by production Compose.
