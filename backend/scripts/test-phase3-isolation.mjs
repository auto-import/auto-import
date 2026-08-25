import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
const apiUrl = process.env.PHASE3_API_URL ?? "http://localhost:3000/api";
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
if (!databaseUrl || !adminPassword) throw new Error("DATABASE_URL and SEED_ADMIN_PASSWORD are required");
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (!/^codex_[a-z0-9_]+$/i.test(databaseName)) throw new Error(`Refusing non-disposable database ${databaseName}`);

const pool = new pg.Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const otherOrganizationId = "90000000-0000-4000-8000-000000000001";
const otherUserId = "90000000-0000-4000-8000-000000000002";
const otherRoleId = "90000000-0000-4000-8000-000000000003";
const otherEmail = "phase3-isolation@example.test";
const otherPassword = "Phase3-Isolation-Only-2026!";

async function raw(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  return { response, payload };
}

async function request(path, options) {
  const result = await raw(path, options);
  if (!result.response.ok || !result.payload.success) throw new Error(`${options?.method ?? "GET"} ${path}: ${result.response.status} ${JSON.stringify(result.payload)}`);
  return result.payload.data;
}

try {
  await prisma.organization.upsert({
    where: { id: otherOrganizationId },
    update: { name: "Phase 3 Isolation Tenant", status: "active" },
    create: { id: otherOrganizationId, name: "Phase 3 Isolation Tenant", type: "headquarters", country: "DZ" },
  });
  await prisma.role.upsert({
    where: { id: otherRoleId },
    update: { organizationId: otherOrganizationId, name: "Isolated Agent", scope: "tenant" },
    create: { id: otherRoleId, organizationId: otherOrganizationId, name: "Isolated Agent", scope: "tenant" },
  });
  const passwordHash = await bcrypt.hash(otherPassword, 10);
  await prisma.user.upsert({
    where: { id: otherUserId },
    update: { passwordHash, status: "active" },
    create: { id: otherUserId, organizationId: otherOrganizationId, firstName: "Tenant", lastName: "Isolé", email: otherEmail, passwordHash },
  });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: otherUserId, roleId: otherRoleId } }, update: {}, create: { userId: otherUserId, roleId: otherRoleId } });
  const allowed = await prisma.permission.findMany({ where: { OR: [
    { resource: "tasks", action: { in: ["read", "write"] } },
    { resource: "notifications", action: "read" },
    { resource: "dashboard", action: "read" },
  ] }, select: { id: true } });
  await prisma.rolePermission.deleteMany({ where: { roleId: otherRoleId } });
  await prisma.rolePermission.createMany({ data: allowed.map(({ id }) => ({ roleId: otherRoleId, permissionId: id })) });

  const adminLogin = await request("/auth/login", { method: "POST", body: { email: "admin@example.com", password: adminPassword } });
  const otherLogin = await request("/auth/login", { method: "POST", body: { email: otherEmail, password: otherPassword } });
  const adminToken = adminLogin.accessToken;
  const otherToken = otherLogin.accessToken;
  const adminTask = await request("/tasks", { method: "POST", token: adminToken, body: { title: "Admin tenant task" } });
  const otherTask = await request("/tasks", { method: "POST", token: otherToken, body: { title: "Other tenant task" } });

  for (const [token, id] of [[adminToken, otherTask.id], [otherToken, adminTask.id]]) {
    const attack = await raw(`/tasks/${id}`, { token });
    if (attack.response.status !== 404) throw new Error(`Cross-tenant task disclosure: ${attack.response.status}`);
  }
  const adminInbox = await request("/notifications?limit=100", { token: adminToken });
  const otherInbox = await request("/notifications?limit=100", { token: otherToken });
  if (adminInbox.items.some((item) => item.organizationId === otherOrganizationId || item.relatedId === otherTask.id)) throw new Error("Cross-tenant notification leaked to admin tenant");
  if (otherInbox.items.some((item) => item.relatedId === adminTask.id)) throw new Error("Cross-tenant notification leaked to other tenant");

  await request(`/tasks/${adminTask.id}/reassign`, { method: "PATCH", token: adminToken, body: { assignedTo: adminLogin.user.id } });
  await request(`/tasks/${adminTask.id}/reassign`, { method: "PATCH", token: adminToken, body: { assignedTo: adminLogin.user.id } });
  const dedupeCount = await prisma.notification.count({ where: { organizationId: adminLogin.user.organizationId, userId: adminLogin.user.id, dedupeKey: `task-reassigned:${adminTask.id}:${adminLogin.user.id}` } });
  if (dedupeCount !== 1) throw new Error(`Notification reconnect/dedupe failure count=${dedupeCount}`);

  for (const path of ["/audit", "/reports/summary", "/settings"]) {
    const forbidden = await raw(path, { token: otherToken });
    if (forbidden.response.status !== 403) throw new Error(`Permission bypass ${path}: ${forbidden.response.status}`);
  }
  console.log(`PHASE3_ISOLATION_PASS database=${databaseName} task-cross-tenant=404 notifications=isolated dedupe=1 restricted-routes=403`);
} finally {
  await prisma.$disconnect();
  await pool.end();
}
