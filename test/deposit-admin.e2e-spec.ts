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

jest.setTimeout(180000);

type ApiBody<T = unknown> = {
  status: string;
  message: string;
  data: T;
};

type AuthData = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; referralCode: string };
};

type AdminAuthData = {
  token: string;
  admin: { id: string; email: string; permissions: AdminPermission[] };
};

describe('Deposit and admin processing smoke flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let queuesMock: {
    enqueuePushNotification: jest.Mock;
    enqueuePickupReminder: jest.Mock;
  };
  const internalJobSecret = `internal-job-${Date.now()}`;
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
  const referredUser = {
    fullName: 'Referred Smoke User',
    email: `referred-smoke-${suffix}@example.com`,
    phoneNumber: `090${suffix}`,
    password: 'SecurePass1!',
  };

  beforeAll(async () => {
    process.env.INTERNAL_JOB_SECRET = internalJobSecret;
    const emailMock = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    queuesMock = {
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
        permissions: [
          AdminPermission.MANAGE_ADMINS,
          AdminPermission.MANAGE_USERS,
          AdminPermission.MANAGE_DEPOSITS,
        ],
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
    expect(registerBody.data.user.referralCode).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        ...referredUser,
        email: `invalid-referral-${suffix}@example.com`,
        phoneNumber: `091${suffix}`,
        referralCode: 'INVALIDCODE',
      })
      .expect(400)
      .expect(({ body }) => {
        const response = body as ApiBody<null>;
        expect(response.status).toBe('error');
        expect(response.message).toBe('Invalid referral code');
      });

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        ...referredUser,
        referralCode: registerBody.data.user.referralCode,
      })
      .expect(201);
    const referredLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: referredUser.email, password: referredUser.password })
      .expect(201);
    const referredLoginBody = referredLoginResponse.body as ApiBody<AuthData>;
    const referredUserAccessToken = referredLoginBody.data.accessToken;
    const referredUserId = referredLoginBody.data.user.id;

    await expect(
      prisma.referral.findFirstOrThrow({
        where: { referrerId: userId },
        select: { status: true, referralCode: true },
      }),
    ).resolves.toEqual({
      status: 'COMPLETED',
      referralCode: registerBody.data.user.referralCode,
    });

    await request(app.getHttpServer())
      .get('/api/v1/items/recycle-categories?page=1&limit=10')
      .expect(200)
      .expect(({ body }) => {
        const response = body as ApiBody<{
          categories: Array<{
            id: string;
            name: string;
            weightKg: number;
            pointValue: number;
            imageUrl: string;
            isActive: boolean;
          }>;
        }> & {
          pagination: {
            page: number;
            limit: number;
            total: number;
            pages: number;
          };
        };
        expect(response.status).toBe('success');
        expect(response.message).toBe(
          'Recycle categories retrieved successfully',
        );
        expect(response.pagination.total).toBeGreaterThanOrEqual(1);
        expect(response.data.categories).toContainEqual(
          expect.objectContaining({
            id: item.id,
            name: itemName,
            weightKg: item.weightKg,
            pointValue: item.pointValue,
            imageUrl: item.imageUrl,
            isActive: true,
          }),
        );
      });

    await request(app.getHttpServer())
      .get('/api/v1/items?page=1&limit=10')
      .expect(200)
      .expect(({ body }) => {
        const response = body as ApiBody<{
          items: Array<{ id: string; name: string }>;
        }> & {
          pagination: { total: number };
        };
        expect(response.status).toBe('success');
        expect(response.message).toBe(
          'Recyclable items retrieved successfully',
        );
        expect(response.pagination.total).toBeGreaterThanOrEqual(1);
        expect(
          response.data.items.some((listedItem) => listedItem.id === item.id),
        ).toBe(true);
      });

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

    await request(app.getHttpServer())
      .post('/api/v1/deposits')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .send({
        item: item.id,
        customLocation: {
          address: '10 Wrong Payload Street, Lagos',
          geometry: { type: 'Point', coordinates: [3.3792, 6.5244] },
        },
        imageUrl: 'https://example.com/wrong-field-deposit.png',
      })
      .expect(400)
      .expect(({ body }) => {
        const response = body as ApiBody<null>;
        expect(response.status).toBe('error');
        expect(response.message).toContain('property item should not exist');
        expect(response.message).toContain('itemId must be a mongodb id');
      });

    await request(app.getHttpServer())
      .post('/api/v1/deposits')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .field('itemId', item.id)
      .field('locationId', '')
      .field(
        'customLocation',
        JSON.stringify({
          address: '11 Swagger Multipart Street, Lagos',
          geometry: { type: 'Point', coordinates: [3.3792, 6.5244] },
        }),
      )
      .field('image', '')
      .field('imageUrl', 'https://example.com/swagger-deposit-image.jpg')
      .field('imageId', '')
      .field(
        'preferredPickupAt',
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      )
      .expect(201)
      .expect(({ body }) => {
        const response = body as ApiBody<{
          deposit: { id: string; status: string; preferredPickupAt: string };
        }>;
        expect(response.status).toBe('success');
        expect(response.message).toBe(
          'Deposit request submitted successfully',
        );
        expect(response.data.deposit.status).toBe('PENDING');
        expect(response.data.deposit.preferredPickupAt).toEqual(
          expect.any(String),
        );
      });

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
        const response = body as ApiBody<{
          deposits: Array<{ id: string }>;
        }> & {
          pagination: { total: number };
        };
        expect(response.status).toBe('success');
        expect(response.message).toBe(
          'Deposit requests retrieved successfully',
        );
        expect(response.pagination.total).toBeGreaterThanOrEqual(1);
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

    await request(app.getHttpServer())
      .get('/api/v1/admin/admins?page=1&limit=10')
      .set('Authorization', `Bearer ${adminLoginBody.data.token}`)
      .expect(200)
      .expect(({ body }) => {
        const response = body as ApiBody<{
          admins: Array<{ id: string }>;
        }> & {
          pagination: { total: number };
        };
        expect(response.status).toBe('success');
        expect(response.message).toBe('Admins retrieved successfully');
        expect(response.pagination.total).toBeGreaterThanOrEqual(1);
        expect(
          response.data.admins.some((entry) => entry.id === admin.id),
        ).toBe(true);
      });

    await request(app.getHttpServer())
      .get('/api/v1/admin/users?page=1&limit=10')
      .set('Authorization', `Bearer ${adminLoginBody.data.token}`)
      .expect(200)
      .expect(({ body }) => {
        const response = body as ApiBody<{
          users: Array<{ id: string }>;
        }> & {
          pagination: { total: number };
        };
        expect(response.status).toBe('success');
        expect(response.message).toBe('Users retrieved successfully');
        expect(response.pagination.total).toBeGreaterThanOrEqual(1);
        expect(response.data.users.some((entry) => entry.id === userId)).toBe(
          true,
        );
      });

    await request(app.getHttpServer())
      .get('/api/v1/admin/deposits?page=1&limit=10')
      .set('Authorization', `Bearer ${adminLoginBody.data.token}`)
      .expect(200)
      .expect(({ body }) => {
        const response = body as ApiBody<{
          deposits: Array<{ id: string }>;
        }> & {
          pagination: { total: number };
        };
        expect(response.status).toBe('success');
        expect(response.message).toBe(
          'Deposit requests retrieved successfully',
        );
        expect(response.pagination.total).toBeGreaterThanOrEqual(1);
        expect(
          response.data.deposits.some((deposit) => deposit.id === depositId),
        ).toBe(true);
      });

    const pickupDepositResponse = await request(app.getHttpServer())
      .post('/api/v1/deposits')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .send({
        itemId: item.id,
        customLocation: {
          address: '12 Pickup Schedule Street, Lagos',
          geometry: { type: 'Point', coordinates: [3.3901, 6.5112] },
        },
        preferredPickupAt: new Date(
          Date.now() + 36 * 60 * 60 * 1000,
        ).toISOString(),
        imageUrl: 'https://example.com/smoke-pickup-schedule.png',
      })
      .expect(201);
    const pickupDepositBody = pickupDepositResponse.body as ApiBody<{
      deposit: { id: string; status: string; preferredPickupAt: string };
    }>;
    const pickupDepositId = pickupDepositBody.data.deposit.id;
    expect(pickupDepositBody.data.deposit.preferredPickupAt).toEqual(
      expect.any(String),
    );
    const scheduledPickupAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/deposits/${pickupDepositId}/schedule-pickup`)
      .set('Authorization', `Bearer ${adminLoginBody.data.token}`)
      .send({
        scheduledPickupAt: new Date(Date.now() - 60 * 1000).toISOString(),
      })
      .expect(400)
      .expect(({ body }) => {
        const response = body as ApiBody<null>;
        expect(response.status).toBe('error');
        expect(response.message).toBe('Pickup schedule must be in the future');
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/deposits/${pickupDepositId}/schedule-pickup`)
      .set('Authorization', `Bearer ${adminLoginBody.data.token}`)
      .send({ scheduledPickupAt: scheduledPickupAt.toISOString() })
      .expect(200)
      .expect(({ body }) => {
        const response = body as ApiBody<{
          deposit: {
            id: string;
            status: string;
            scheduledPickupAt: string;
          };
        }>;
        expect(response.status).toBe('success');
        expect(response.message).toBe('Pickup scheduled successfully');
        expect(response.data.deposit.id).toBe(pickupDepositId);
        expect(response.data.deposit.status).toBe('SCHEDULED');
        expect(
          new Date(response.data.deposit.scheduledPickupAt).toISOString(),
        ).toBe(scheduledPickupAt.toISOString());
      });

    const pickupReminderNotification =
      await prisma.notification.findFirstOrThrow({
        where: {
          userId,
          type: NotificationType.PICKUP_REMINDER,
        },
        orderBy: { createdAt: 'desc' },
      });
    expect(pickupReminderNotification.title).toBe('Pickup scheduled');
    expect(pickupReminderNotification.data).toEqual(
      expect.objectContaining({ depositRequestId: pickupDepositId }),
    );
    expect(queuesMock.enqueuePickupReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        depositRequestId: pickupDepositId,
        itemName,
      }),
    );

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/deposits/${pickupDepositId}/arrived`)
      .set('Authorization', `Bearer ${adminLoginBody.data.token}`)
      .expect(200)
      .expect(({ body }) => {
        const response = body as ApiBody<{
          deposit: {
            id: string;
            status: string;
            pickupArrivedAt: string;
          };
        }>;
        expect(response.status).toBe('success');
        expect(response.message).toBe('Pickup arrival recorded successfully');
        expect(response.data.deposit.id).toBe(pickupDepositId);
        expect(response.data.deposit.status).toBe('IN_PROGRESS');
        expect(response.data.deposit.pickupArrivedAt).toEqual(
          expect.any(String),
        );
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/deposits/${pickupDepositId}/picked-up`)
      .set('Authorization', `Bearer ${adminLoginBody.data.token}`)
      .expect(200)
      .expect(({ body }) => {
        const response = body as ApiBody<{
          deposit: { id: string; status: string };
        }>;
        expect(response.status).toBe('success');
        expect(response.message).toBe(
          'Pickup marked as picked up successfully',
        );
        expect(response.data.deposit.id).toBe(pickupDepositId);
        expect(response.data.deposit.status).toBe('PICKED_UP');
      });

    const pickupArrivalNotification =
      await prisma.notification.findFirstOrThrow({
        where: {
          userId,
          type: NotificationType.PICKUP_ARRIVAL,
        },
        orderBy: { createdAt: 'desc' },
      });
    expect(pickupArrivalNotification.title).toBe('Pickup team has arrived');
    expect(pickupArrivalNotification.data).toEqual(
      expect.objectContaining({ depositRequestId: pickupDepositId }),
    );

    await request(app.getHttpServer())
      .post('/api/v1/internal/jobs/pickup-reminders/run')
      .expect(401)
      .expect(({ body }) => {
        const response = body as ApiBody<null>;
        expect(response.status).toBe('error');
        expect(response.message).toBe('Invalid internal job secret');
      });

    await request(app.getHttpServer())
      .post('/api/v1/internal/jobs/pickup-reminders/run')
      .set('x-internal-job-secret', internalJobSecret)
      .expect(201)
      .expect(({ body }) => {
        const response = body as ApiBody<{
          dayBeforeSent: number;
          pickupMorningSent: number;
        }>;
        expect(response.status).toBe('success');
        expect(response.message).toBe(
          'Pickup reminder job completed successfully',
        );
        expect(response.data.dayBeforeSent).toEqual(expect.any(Number));
        expect(response.data.pickupMorningSent).toEqual(expect.any(Number));
      });

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

    const referredDepositResponse = await request(app.getHttpServer())
      .post('/api/v1/deposits')
      .set('Authorization', `Bearer ${referredUserAccessToken}`)
      .send({
        itemId: item.id,
        customLocation: {
          address: '14 Referred User Deposit Street, Lagos',
          geometry: { type: 'Point', coordinates: [3.3811, 6.5199] },
        },
        imageUrl: 'https://example.com/smoke-referred-deposit.png',
      })
      .expect(201);
    const referredDepositBody = referredDepositResponse.body as ApiBody<{
      deposit: { id: string };
    }>;
    const referredDepositId = referredDepositBody.data.deposit.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/deposits/${referredDepositId}/status`)
      .set('Authorization', `Bearer ${adminLoginBody.data.token}`)
      .send({ status: 'CREDITED', adminNote: 'Referral bonus smoke test' })
      .expect(200);

    const referralBonus = Math.max(1, Math.floor(item.pointValue * 0.05));
    await expect(
      prisma.referral.findFirstOrThrow({
        where: { referrerId: userId, referredUserId },
        select: { status: true, rewardPoints: true, rewardedAt: true },
      }),
    ).resolves.toEqual({
      status: 'REWARDED',
      rewardPoints: referralBonus,
      rewardedAt: expect.any(Date),
    });
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { pointBalance: true },
      }),
    ).resolves.toEqual({ pointBalance: item.pointValue + referralBonus });
    await expect(
      prisma.transaction.findFirstOrThrow({
        where: {
          userId,
          amount: referralBonus,
          description: { contains: 'Referral bonus' },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'COMPLETED' }));

    const referralBonusNotification =
      await prisma.notification.findFirstOrThrow({
        where: {
          userId,
          type: NotificationType.COINS_CREDITED,
          title: 'Referral bonus credited',
        },
      });
    expect(referralBonusNotification.data).toEqual(
      expect.objectContaining({
        referredUserId,
        depositRequestId: referredDepositId,
        pointValue: referralBonus,
      }),
    );

    await request(app.getHttpServer())
      .get('/api/v1/users/dashboard')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .expect(200)
      .expect(({ body }) => {
        const response = body as ApiBody<{
          dashboard: {
            wallet: {
              coinsBalance: number;
              totalCoinsEarned: number;
              totalRecycled: number;
              savedCO2: null;
              referrals: number;
            };
            recentDeposits: Array<{ id: string; status: string }>;
            recentTransactions: Array<{
              type: string;
              status: string;
              amount: number;
            }>;
          };
        }>;
        expect(response.status).toBe('success');
        expect(response.message).toBe('User dashboard retrieved successfully');
        expect(response.data.dashboard.wallet).toEqual({
          coinsBalance: item.pointValue + referralBonus,
          totalCoinsEarned: item.pointValue,
          totalRecycled: 1,
          savedCO2: null,
          referrals: 1,
        });
        expect(
          response.data.dashboard.recentDeposits.some(
            (deposit) =>
              deposit.id === depositId && deposit.status === 'CREDITED',
          ),
        ).toBe(true);
        expect(
          response.data.dashboard.recentTransactions.some(
            (transaction) =>
              transaction.type === 'CREDIT' &&
              transaction.status === 'COMPLETED' &&
              transaction.amount === item.pointValue,
          ),
        ).toBe(true);
      });
  });

  async function cleanupTestData() {
    const users = await prisma.user.findMany({
      where: { email: { in: [testUser.email, referredUser.email] } },
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
        where: { email: { in: [testUser.email, referredUser.email] } },
      });
      await prisma.referral.deleteMany({
        where: {
          OR: [
            { referrerId: { in: userIds } },
            { referredUserId: { in: userIds } },
          ],
        },
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
