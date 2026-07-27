import { PrismaClient } from '@prisma/client';

async function seedLocations(prisma: PrismaClient) {
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

async function seedItems(prisma: PrismaClient) {
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

export async function seedAppData(prisma: PrismaClient) {
  await seedLocations(prisma);
  await seedItems(prisma);
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedAppData(prisma)
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
