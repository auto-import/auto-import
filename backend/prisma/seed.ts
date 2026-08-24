import { PrismaClient, type Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { ALL_PERMISSIONS } from '@auto-import/contracts';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const environment = process.env.NODE_ENV ?? 'development';
  if (!['development', 'test'].includes(environment)) {
    throw new Error('Database seeding is restricted to development and test');
  }

  const organizationId = '00000000-0000-4000-8000-000000000001';
  const officeId = '00000000-0000-4000-8000-000000000002';
  const adminUserId = '00000000-0000-4000-8000-000000000003';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD ?? 'AutoImport-Dev-Only-2026!';

  console.log(`Seeding deterministic ${environment} data...`);

  // 1. Create Organization
  const org = await prisma.organization.upsert({
    where: { id: organizationId },
    update: {
      name: 'AutoImport HQ',
      type: 'headquarters',
      status: 'active',
    },
    create: {
      id: organizationId,
      name: 'AutoImport HQ',
      type: 'headquarters',
      status: 'active',
    },
  });

  await prisma.office.upsert({
    where: { id: officeId },
    update: {
      organizationId: org.id,
      name: 'Siège Alger',
      country: 'Algérie',
      city: 'Alger',
      status: 'active',
    },
    create: {
      id: officeId,
      organizationId: org.id,
      name: 'Siège Alger',
      country: 'Algérie',
      city: 'Alger',
      status: 'active',
    },
  });

  // 2. Create User admin@example.com
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const user = await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: {
      organizationId: org.id,
      officeId,
      firstName: 'Admin',
      lastName: 'User',
      passwordHash,
      status: 'active',
    },
    create: {
      id: adminUserId,
      organizationId: org.id,
      officeId,
      firstName: 'Admin',
      lastName: 'User',
      email: adminEmail.toLowerCase(),
      passwordHash,
      status: 'active',
    },
  });

  // 3. Create All System Permissions
  const allPermissions = ALL_PERMISSIONS.map((key) => {
    const separator = key.indexOf(':');
    const resource = key.slice(0, separator);
    const action = key.slice(separator + 1);
    return {
      resource,
      action,
      description: `${action} access to ${resource}`,
    };
  });

  const permissionRecords: Record<string, string> = {};
  for (const p of allPermissions) {
    const perm = await prisma.permission.upsert({
      where: {
        resource_action: { resource: p.resource, action: p.action },
      },
      update: { description: p.description },
      create: p,
    });
    permissionRecords[`${p.resource}:${p.action}`] = perm.id;
  }

  // 4. Create Standard Roles and link permissions
  const roleDefinitions = [
    {
      name: 'Admin',
      description: 'System Administrator (full access)',
      permissions: [...ALL_PERMISSIONS],
    },
    {
      name: 'Direction',
      description: 'Executive Management (full business and management access)',
      permissions: [...ALL_PERMISSIONS],
    },
    {
      name: 'Manager',
      description: 'Operations Manager (all business operations)',
      permissions: [
        'prospects:read',
        'prospects:write',
        'clients:read',
        'clients:write',
        'dossiers:read',
        'dossiers:write',
        'vehicles:read',
        'vehicles:write',
        'warehouses:read',
        'warehouses:write',
        'vehicleRequests:read',
        'vehicleRequests:write',
        'orders:read',
        'orders:write',
        'partners:read',
        'partners:write',
        'users:read',
        'roles:read',
        'crmTimeline:read',
        'crmTimeline:write',
        'callCenter:access',
        'callCenter:dispatch',
        'callCenter:handle',
        'whatsapp:handle',
        'tasks:read',
        'tasks:write',
        'appointments:read',
        'appointments:write',
        'crmKpi:own',
        'crmKpi:organization',
        'channels:manage',
      ],
    },
    {
      name: 'Commercial',
      description:
        'Sales Agent (leads, clients, dossiers, vehicle requests, orders)',
      permissions: [
        'prospects:read',
        'prospects:write',
        'clients:read',
        'clients:write',
        'dossiers:read',
        'dossiers:write',
        'vehicles:read',
        'vehicleRequests:read',
        'vehicleRequests:write',
        'orders:read',
        'orders:write',
        'partners:read',
        'crmTimeline:read',
        'crmTimeline:write',
        'callCenter:access',
        'callCenter:handle',
        'whatsapp:handle',
        'tasks:read',
        'tasks:write',
        'appointments:read',
        'appointments:write',
        'crmKpi:own',
      ],
    },
    {
      name: 'Call Center',
      description: 'Dispatcher and omnichannel call-center agent',
      permissions: [
        'prospects:read',
        'prospects:write',
        'clients:read',
        'crmTimeline:read',
        'crmTimeline:write',
        'callCenter:access',
        'callCenter:dispatch',
        'callCenter:handle',
        'whatsapp:handle',
        'tasks:read',
        'tasks:write',
        'appointments:read',
        'appointments:write',
        'crmKpi:own',
      ],
    },
    {
      name: 'Logistics',
      description: 'Logistics & Fleet Manager (vehicles, warehouses, shipping)',
      permissions: [
        'vehicles:read',
        'vehicles:write',
        'warehouses:read',
        'warehouses:write',
        'dossiers:read',
        'orders:read',
        'partners:read',
        'partners:write',
      ],
    },
    {
      name: 'Finance',
      description:
        'Accountant & Finance (orders, invoices, payments, dossier view)',
      permissions: [
        'orders:read',
        'orders:write',
        'dossiers:read',
        'clients:read',
        'vehicles:read',
        'partners:read',
      ],
    },
  ];

  let adminRole: Role | null = null;

  for (const roleDef of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: {
        organizationId_name: {
          organizationId: org.id,
          name: roleDef.name,
        },
      },
      update: {
        scope: 'tenant',
        description: roleDef.description,
      },
      create: {
        organizationId: org.id,
        name: roleDef.name,
        scope: 'tenant',
        description: roleDef.description,
      },
    });

    if (roleDef.name === 'Admin') {
      adminRole = role;
    }

    const permissionIds = roleDef.permissions
      .map((permission) => permissionRecords[permission])
      .filter((permissionId): permissionId is string => Boolean(permissionId));
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      }),
    ]);
  }

  // 5. Link UserRole for admin
  if (adminRole) {
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: adminRole.id },
    });
  }

  await prisma.companyChannel.upsert({
    where: {
      organizationId_channel_normalizedNumber: {
        organizationId: org.id,
        channel: 'VOICE',
        normalizedNumber: '+21321000000',
      },
    },
    update: { providerKey: 'mock', active: true },
    create: {
      id: '00000000-0000-4000-8000-000000000010',
      organizationId: org.id,
      channel: 'VOICE',
      displayName: 'Ligne principale (simulation)',
      normalizedNumber: '+21321000000',
      providerKey: 'mock',
      queueName: 'commercial',
      routingConfig: { simulated: true },
    },
  });

  await prisma.companyChannel.upsert({
    where: {
      organizationId_channel_normalizedNumber: {
        organizationId: org.id,
        channel: 'WHATSAPP',
        normalizedNumber: '+21321000001',
      },
    },
    update: { providerKey: 'mock', active: true },
    create: {
      id: '00000000-0000-4000-8000-000000000011',
      organizationId: org.id,
      channel: 'WHATSAPP',
      displayName: 'WhatsApp principal (simulation)',
      normalizedNumber: '+21321000001',
      providerKey: 'mock',
      queueName: 'commercial',
      routingConfig: { simulated: true },
    },
  });

  await prisma.agentPresence.upsert({
    where: { userId: user.id },
    update: { status: 'AVAILABLE', lastHeartbeatAt: new Date() },
    create: {
      organizationId: org.id,
      userId: user.id,
      status: 'AVAILABLE',
      source: 'MANUAL',
      lastHeartbeatAt: new Date(),
    },
  });

  console.log('Deterministic seed completed successfully');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
