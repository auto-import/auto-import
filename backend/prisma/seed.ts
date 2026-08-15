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

  // 3. Create Role
  let role = await prisma.role.findFirst({ where: { name: 'Admin' } });
  if (!role) {
    role = await prisma.role.create({
      data: {
        organizationId: org.id,
        name: 'Admin',
        scope: 'tenant',
        description: 'Administrator role',
      },
    });
    console.log('Created Role:', role.name);
  }

  // 4. Create All System Permissions and link to Admin
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
  ];

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

    const rolePerm = await prisma.rolePermission.findUnique({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: perm.id,
        },
      },
    });
    if (!rolePerm) {
      await prisma.rolePermission.create({
        data: {
          roleId: role.id,
          permissionId: perm.id,
        },
      });
      console.log(`Linked ${p.resource}:${p.action} to Admin Role`);
    }
  }

  // 5. Link UserRole
  const userRole = await prisma.userRole.findUnique({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: role.id,
      },
    },
  });
  if (!userRole) {
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
      },
    });
    console.log('Linked UserRole');
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
