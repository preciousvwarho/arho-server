import { PrismaClient } from '@prisma/client';
import { seedAdmin } from './seed-admin';
import { seedAppData } from './seed-app-data';

const prisma = new PrismaClient();

async function main() {
  await seedAdmin(prisma);
  await seedAppData(prisma);
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
