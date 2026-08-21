import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding test database...');

  // 1. Create Organization
  let org = await prisma.organization.findFirst({ where: { name: 'AutoImport HQ' } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: 'AutoImport HQ',
        type: 'headquarters',
        status: 'active',
      },
    });
    console.log('Created Organization:', org.id);
  }

  // 2. Create User admin@example.com
  const passwordHash = await bcrypt.hash('password123', 10);
  let user = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        organizationId: org.id,
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@example.com',
        passwordHash,
        status: 'active',
      },
    });
    console.log('Created User:', user.email);
  }

  // 3. Create All System Permissions
  const allPermissions = [
    { resource: 'users', action: 'read', description: 'Read users list' },
    { resource: 'users', action: 'write', description: 'Create and edit users' },
    { resource: 'users', action: 'manage', description: 'Manage users' },
    { resource: 'roles', action: 'read', description: 'Read roles' },
    { resource: 'roles', action: 'write', description: 'Create and edit roles' },
    { resource: 'roles', action: 'manage', description: 'Manage roles' },
    { resource: 'prospects', action: 'read', description: 'Read prospects' },
    { resource: 'prospects', action: 'write', description: 'Create and edit prospects' },
    { resource: 'clients', action: 'read', description: 'Read clients' },
    { resource: 'clients', action: 'write', description: 'Create and edit clients' },
    { resource: 'dossiers', action: 'read', description: 'Read dossiers' },
    { resource: 'dossiers', action: 'write', description: 'Create and edit dossiers' },
    { resource: 'vehicles', action: 'read', description: 'Read vehicles and stock' },
    { resource: 'vehicles', action: 'write', description: 'Create and edit vehicles' },
    { resource: 'warehouses', action: 'read', description: 'Read warehouses and stock movements' },
    { resource: 'warehouses', action: 'write', description: 'Create and manage warehouses and locations' },
    { resource: 'vehicle-requests', action: 'read', description: 'Read vehicle requests' },
    { resource: 'vehicle-requests', action: 'write', description: 'Create and edit vehicle requests' },
    { resource: 'orders', action: 'read', description: 'Read orders and reservations' },
    { resource: 'orders', action: 'write', description: 'Create, update and manage orders' },
    { resource: 'partners', action: 'read', description: 'Read partners and suppliers' },
    { resource: 'partners', action: 'write', description: 'Create, update and manage partners' },
  ];

  const permissionRecords: Record<string, string> = {};
  for (const p of allPermissions) {
    let perm = await prisma.permission.findFirst({
      where: { resource: p.resource, action: p.action },
    });
    if (!perm) {
      perm = await prisma.permission.create({
        data: p,
      });
      console.log(`Created Permission: ${p.resource}:${p.action}`);
    }
    permissionRecords[`${p.resource}:${p.action}`] = perm.id;
  }

  // 4. Create Standard Roles and link permissions
  const roleDefinitions = [
    {
      name: 'Admin',
      description: 'System Administrator (full access)',
      permissions: Object.keys(permissionRecords),
    },
    {
      name: 'Direction',
      description: 'Executive Management (full business and management access)',
      permissions: Object.keys(permissionRecords),
    },
    {
      name: 'Manager',
      description: 'Operations Manager (all business operations)',
      permissions: [
        'prospects:read', 'prospects:write',
        'clients:read', 'clients:write',
        'dossiers:read', 'dossiers:write',
        'vehicles:read', 'vehicles:write',
        'warehouses:read', 'warehouses:write',
        'vehicle-requests:read', 'vehicle-requests:write',
        'orders:read', 'orders:write',
        'partners:read', 'partners:write',
        'users:read', 'roles:read',
      ],
    },
    {
      name: 'Commercial',
      description: 'Sales Agent (leads, clients, dossiers, vehicle requests, orders)',
      permissions: [
        'prospects:read', 'prospects:write',
        'clients:read', 'clients:write',
        'dossiers:read', 'dossiers:write',
        'vehicles:read',
        'vehicle-requests:read', 'vehicle-requests:write',
        'orders:read', 'orders:write',
        'partners:read',
      ],
    },
    {
      name: 'Logistics',
      description: 'Logistics & Fleet Manager (vehicles, warehouses, shipping)',
      permissions: [
        'vehicles:read', 'vehicles:write',
        'warehouses:read', 'warehouses:write',
        'dossiers:read',
        'orders:read',
        'partners:read', 'partners:write',
      ],
    },
    {
      name: 'Finance',
      description: 'Accountant & Finance (orders, invoices, payments, dossier view)',
      permissions: [
        'orders:read', 'orders:write',
        'dossiers:read',
        'clients:read',
        'vehicles:read',
        'partners:read',
      ],
    },
  ];

  let adminRole: any = null;

  for (const roleDef of roleDefinitions) {
    let role = await prisma.role.findFirst({
      where: { name: roleDef.name, organizationId: org.id },
    });

    if (!role) {
      role = await prisma.role.create({
        data: {
          organizationId: org.id,
          name: roleDef.name,
          scope: 'tenant',
          description: roleDef.description,
        },
      });
      console.log(`Created Role: ${role.name}`);
    }

    if (roleDef.name === 'Admin') {
      adminRole = role;
    }

    // Link permissions to role
    for (const permKey of roleDef.permissions) {
      const permId = permissionRecords[permKey];
      if (permId) {
        const rolePerm = await prisma.rolePermission.findUnique({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permId,
            },
          },
        });
        if (!rolePerm) {
          await prisma.rolePermission.create({
            data: {
              roleId: role.id,
              permissionId: permId,
            },
          });
        }
      }
    }
  }

  // 5. Link UserRole for admin
  if (adminRole) {
    const userRole = await prisma.userRole.findUnique({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: adminRole.id,
        },
      },
    });
    if (!userRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: adminRole.id,
        },
      });
      console.log('Linked Admin UserRole');
    }
  }

  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
