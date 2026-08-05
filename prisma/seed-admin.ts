import { randomBytes } from 'node:crypto';
import { AdminPermission, AdminRole, PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const allPermissions = [
  AdminPermission.MANAGE_USERS,
  AdminPermission.MANAGE_DEPOSITS,
  AdminPermission.MANAGE_LOCATIONS,
  AdminPermission.VIEW_ANALYTICS,
  AdminPermission.MANAGE_ADMINS,
  AdminPermission.SYSTEM_SETTINGS,
];

function getAdminPassword(existingAdmin: boolean) {
  if (process.env.SEED_ADMIN_PASSWORD) {
    return {
      password: process.env.SEED_ADMIN_PASSWORD,
      generated: false,
    };
  }

  if (existingAdmin) {
    return {
      password: undefined,
      generated: false,
    };
  }

  return {
    password: `Arho-${randomBytes(4).toString('hex')}!A1`,
    generated: true,
  };
}

export async function seedAdmin(prisma: PrismaClient) {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@arho.local';
  const username = process.env.SEED_ADMIN_USERNAME ?? 'superadmin';
  const existing = await prisma.admin.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  const { password, generated } = getAdminPassword(Boolean(existing));

  if (existing) {
    await prisma.admin.update({
      where: { id: existing.id },
      data: {
        fullName: process.env.SEED_ADMIN_NAME ?? existing.fullName,
        role: AdminRole.SUPER_ADMIN,
        permissions: allPermissions,
        isActive: true,
        ...(password ? { passwordHash: await hash(password, 12) } : {}),
      },
    });

    console.log(`Admin already exists: ${email}`);
    if (password) {
      console.log('Admin password was updated from SEED_ADMIN_PASSWORD.');
    }
    return;
  }

  if (!password) {
    throw new Error('Unable to create admin without a password');
  }

  await prisma.admin.create({
    data: {
      fullName: process.env.SEED_ADMIN_NAME ?? 'Super Administrator',
      email,
      username,
      passwordHash: await hash(password, 12),
      role: AdminRole.SUPER_ADMIN,
      permissions: allPermissions,
      isActive: true,
    },
  });

  console.log(`Created admin: ${email}`);
  console.log(`Admin username: ${username}`);
  if (generated) {
    console.log(`Generated admin password: ${password}`);
  }
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedAdmin(prisma)
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
