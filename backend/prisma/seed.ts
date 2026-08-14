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

  // 4. Create Permission
  let perm = await prisma.permission.findFirst({
    where: { resource: 'users', action: 'read' },
  });
  if (!perm) {
    perm = await prisma.permission.create({
      data: {
        resource: 'users',
        action: 'read',
        description: 'Read users list',
      },
    });
    console.log('Created Permission: users:read');
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

  // 6. Link RolePermission
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
    console.log('Linked RolePermission');
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
