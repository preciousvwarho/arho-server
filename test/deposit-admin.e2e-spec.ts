import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminPermission, AdminRole, NotificationType } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { EmailService } from '../src/email/email.service';
import { QueuesService } from '../src/queues/queues.service';

jest.setTimeout(30000);

type ApiBody<T = unknown> = {
  status: string;
  message: string;
  data: T;
};

type AuthData = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
};

type AdminAuthData = {
  token: string;
  admin: { id: string; email: string; permissions: AdminPermission[] };
};

describe('Deposit and admin processing smoke flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = Date.now().toString().slice(-8);
  const itemName = `Smoke PET Bottle ${suffix}`;
  const adminEmail = `smoke-admin-${suffix}@example.com`;
  const adminUsername = `smokeadmin${suffix}`;
  const adminPassword = 'AdminPass1!';
  const testUser = {
    fullName: 'Deposit Smoke User',
    email: `deposit-smoke-${suffix}@example.com`,
    phoneNumber: `081${suffix}`,
    password: 'SecurePass1!',
  };

  beforeAll(async () => {
    const emailMock = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    const queuesMock = {
      enqueuePushNotification: jest.fn().mockResolvedValue(undefined),
      enqueuePickupReminder: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue(emailMock)
      .overrideProvider(QueuesService)
      .useValue(queuesMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  it('creates a deposit, notifies the user, and lets an admin credit coins', async () => {
    const item = await prisma.item.create({
      data: {
        name: itemName,
        description: 'Smoke-test recyclable bottle',
        weightKg: 1.5,
        pointValue: 25,
        imageUrl: 'https://example.com/smoke-bottle.png',
        isActive: true,
      },
    });
    const admin = await prisma.admin.create({
      data: {
        fullName: 'Smoke Admin',
        email: adminEmail,
        username: adminUsername,
        passwordHash: await hash(adminPassword, 12),
        role: AdminRole.ADMIN,
        permissions: [AdminPermission.MANAGE_DEPOSITS],
        isActive: true,
      },
    });

    expect(admin.id).toEqual(expect.any(String));

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser)
      .expect(201);
    const registerBody = registerResponse.body as ApiBody<AuthData>;
    const userAccessToken = registerBody.data.accessToken;
    const userId = registerBody.data.user.id;

    const depositResponse = await request(app.getHttpServer())
      .post('/api/v1/deposits')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .send({
        itemId: item.id,
        customLocation: {
          address: '10 Smoke Test Street, Lagos',
          geometry: { type: 'Point', coordinates: [3.3792, 6.5244] },
        },
        imageUrl: 'https://example.com/smoke-deposit.png',
      })
      .expect(201);

    const depositBody = depositResponse.body as ApiBody<{
      deposit: { id: string; status: string; itemName: string };
    }>;
    expect(depositBody.status).toBe('success');
    expect(depositBody.message).toBe('Deposit request submitted successfully');
    expect(depositBody.data.deposit.status).toBe('PENDING');
    expect(depositBody.data.deposit.itemName).toBe(itemName);

    const depositId = depositBody.data.deposit.id;
    const depositNotification = await prisma.notification.findFirstOrThrow({
      where: { userId, type: NotificationType.DEPOSIT_CREATED },
    });
    expect(depositNotification.title).toBe('Deposit request submitted');
    expect(depositNotification.data).toEqual(
      expect.objectContaining({ depositRequestId: depositId }),
    );

    await request(app.getHttpServer())
      .get('/api/v1/deposits')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .expect(200)
      .expect(({ body }) => {
        const response = body as ApiBody<{ deposits: Array<{ id: string }> }>;
        expect(response.status).toBe('success');
        expect(response.message).toBe('Deposit requests retrieved successfully');
        expect(
          response.data.deposits.some((deposit) => deposit.id === depositId),
        ).toBe(true);
      });

    const adminLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ login: adminEmail, password: adminPassword })
      .expect(201);
    const adminLoginBody = adminLoginResponse.body as ApiBody<AdminAuthData>;
    expect(adminLoginBody.data.admin.permissions).toContain(
      AdminPermission.MANAGE_DEPOSITS,
    );

    const processResponse = await request(app.getHttpServer())
      .patch(`/api/v1/admin/deposits/${depositId}/status`)
      .set('Authorization', `Bearer ${adminLoginBody.data.token}`)
      .send({ status: 'CREDITED', adminNote: 'Smoke test approved' })
      .expect(200);

    const processBody = processResponse.body as ApiBody<{
      deposit: { id: string; status: string };
    }>;
    expect(processBody.status).toBe('success');
    expect(processBody.message).toBe('Deposit request processed successfully');
    expect(processBody.data.deposit.status).toBe('CREDITED');

    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { pointBalance: true },
      }),
    ).resolves.toEqual({ pointBalance: item.pointValue });
    await expect(
      prisma.transaction.findFirstOrThrow({
        where: {
          userId,
          type: 'CREDIT',
          status: 'COMPLETED',
          amount: item.pointValue,
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({ balanceAfter: item.pointValue }),
    );
    const coinsNotification = await prisma.notification.findFirstOrThrow({
      where: { userId, type: NotificationType.COINS_CREDITED },
    });
    expect(coinsNotification.title).toBe('Coins credited');
    expect(coinsNotification.data).toEqual(
      expect.objectContaining({ depositRequestId: depositId }),
    );
  });

  async function cleanupTestData() {
    const users = await prisma.user.findMany({
      where: { email: testUser.email },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    const items = await prisma.item.findMany({
      where: { name: itemName },
      select: { id: true },
    });
    const itemIds = items.map((item) => item.id);

    if (userIds.length > 0) {
      await prisma.emailVerification.deleteMany({
        where: { email: testUser.email },
      });
      await prisma.refreshSession.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.notification.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.transaction.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.depositRequest.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }

    if (itemIds.length > 0) {
      await prisma.depositRequest.deleteMany({
        where: { itemId: { in: itemIds } },
      });
      await prisma.item.deleteMany({
        where: { id: { in: itemIds } },
      });
    }

    await prisma.admin.deleteMany({
      where: { OR: [{ email: adminEmail }, { username: adminUsername }] },
    });
  }
});
