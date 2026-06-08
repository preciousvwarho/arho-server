import { randomBytes } from 'node:crypto';
import { AdminPermission, AdminRole, PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

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
    password: `Trash4Cash-${randomBytes(4).toString('hex')}!A1`,
    generated: true,
  };
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@trash4cash.local';
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

async function seedLocations() {
  const nigeria = await prisma.country.upsert({
    where: { code: 'NG' },
    update: {
      name: 'Nigeria',
      currency: 'NGN',
      phoneCode: '+234',
      isActive: true,
    },
    create: {
      name: 'Nigeria',
      code: 'NG',
      currency: 'NGN',
      phoneCode: '+234',
    },
  });

  const lagos = await prisma.state.upsert({
    where: {
      name_countryId: {
        name: 'Lagos',
        countryId: nigeria.id,
      },
    },
    update: {
      code: 'LA',
      isActive: true,
    },
    create: {
      name: 'Lagos',
      code: 'LA',
      countryId: nigeria.id,
    },
  });

  const areas = [
    { name: 'Ikeja', code: 'IKEJA' },
    { name: 'Lekki', code: 'LEKKI' },
    { name: 'Yaba', code: 'YABA' },
    { name: 'Surulere', code: 'SURULERE' },
    { name: 'Lagos Mainland', code: 'MAINLAND' },
  ];

  for (const area of areas) {
    await prisma.area.upsert({
      where: {
        name_stateId: {
          name: area.name,
          stateId: lagos.id,
        },
      },
      update: {
        code: area.code,
        countryId: nigeria.id,
        isActive: true,
      },
      create: {
        ...area,
        stateId: lagos.id,
        countryId: nigeria.id,
      },
    });
  }

  console.log(`Seeded ${areas.length} Lagos pickup areas.`);
}

async function seedItems() {
  const items = [
    {
      name: 'Plastic Bottle',
      description: 'Clean PET plastic bottles for recycling pickup.',
      weightKg: 1,
      pointValue: 20,
      imageUrl: 'https://placehold.co/800x600.jpg?text=Plastic+Bottle',
    },
    {
      name: 'Aluminium Can',
      description: 'Sorted aluminium beverage cans.',
      weightKg: 1,
      pointValue: 35,
      imageUrl: 'https://placehold.co/800x600.jpg?text=Aluminium+Can',
    },
    {
      name: 'Paper Bundle',
      description: 'Bundled paper, cartons, and cardboard.',
      weightKg: 1,
      pointValue: 15,
      imageUrl: 'https://placehold.co/800x600.jpg?text=Paper+Bundle',
    },
    {
      name: 'Glass Bottle',
      description: 'Reusable or recyclable glass bottles.',
      weightKg: 1,
      pointValue: 10,
      imageUrl: 'https://placehold.co/800x600.jpg?text=Glass+Bottle',
    },
  ];

  for (const item of items) {
    await prisma.item.upsert({
      where: { name: item.name },
      update: {
        description: item.description,
        weightKg: item.weightKg,
        pointValue: item.pointValue,
        imageUrl: item.imageUrl,
        isActive: true,
      },
      create: item,
    });
  }

  console.log(`Seeded ${items.length} recyclable item types.`);
}

async function main() {
  await seedAdmin();
  await seedLocations();
  await seedItems();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
