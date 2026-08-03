import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { EmailService } from '../src/email/email.service';
import { PaymentGatewayService } from '../src/modules/payments/payment-gateway.service';
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

describe('Payment smoke flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = Date.now().toString().slice(-8);
  const startingBalance = 500;
  const airtimeAmount = 100;
  const testUser = {
    fullName: 'Payment Smoke User',
    email: `payment-smoke-${suffix}@example.com`,
    phoneNumber: `070${suffix}`,
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
    const paymentGatewayMock = {
      payWithVtpass: jest.fn().mockResolvedValue({
        code: '000',
        response_description: 'TRANSACTION SUCCESSFUL',
        content: { transactions: { status: 'delivered' } },
      }),
      getVtpassVariations: jest.fn().mockResolvedValue([]),
      getFlutterwaveBanks: jest
        .fn()
        .mockResolvedValue({ status: 'success', data: [] }),
      resolveFlutterwaveAccount: jest.fn().mockResolvedValue({
        account_name: 'Smoke User',
        account_number: '0123456789',
      }),
      createFlutterwaveTransfer: jest
        .fn()
        .mockResolvedValue({ status: 'success' }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue(emailMock)
      .overrideProvider(QueuesService)
      .useValue(queuesMock)
      .overrideProvider(PaymentGatewayService)
      .useValue(paymentGatewayMock)
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

  it('buys airtime with wallet points and creates a bill-payment notification', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser)
      .expect(201);
    const registerBody = registerResponse.body as ApiBody<AuthData>;
    const accessToken = registerBody.data.accessToken;
    const userId = registerBody.data.user.id;

    await request(app.getHttpServer())
      .post('/api/v1/auth/pin')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ pin: '1234' })
      .expect(201);

    await prisma.user.update({
      where: { id: userId },
      data: { pointBalance: startingBalance },
    });

    const airtimeResponse = await request(app.getHttpServer())
      .post('/api/v1/services/airtime')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        phoneNumber: '08031234567',
        amount: airtimeAmount,
        network: 'mtn',
        transactionPin: '1234',
      })
      .expect(201);

    const airtimeBody = airtimeResponse.body as ApiBody<{
      transaction: {
        id: string;
        type: string;
        status: string;
        amount: number;
        balanceAfter: number;
      };
    }>;
    expect(airtimeBody.status).toBe('success');
    expect(airtimeBody.message).toBe('Airtime purchased successfully');
    expect(airtimeBody.data.transaction.type).toBe('AIRTIME');
    expect(airtimeBody.data.transaction.status).toBe('COMPLETED');
    expect(airtimeBody.data.transaction.amount).toBe(airtimeAmount);
    expect(airtimeBody.data.transaction.balanceAfter).toBe(
      startingBalance - airtimeAmount,
    );

    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { pointBalance: true },
      }),
    ).resolves.toEqual({ pointBalance: startingBalance - airtimeAmount });

    await expect(
      prisma.transaction.findFirstOrThrow({
        where: {
          userId,
          type: 'AIRTIME',
          status: 'COMPLETED',
          amount: airtimeAmount,
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        balanceAfter: startingBalance - airtimeAmount,
      }),
    );

    const notification = await prisma.notification.findFirstOrThrow({
      where: { userId, type: NotificationType.BILL_PAYMENT },
    });
    expect(notification.title).toBe('Bill payment successful');
    expect(notification.data).toEqual(
      expect.objectContaining({
        amount: airtimeAmount,
        type: 'AIRTIME',
      }),
    );

    await request(app.getHttpServer())
      .get('/api/v1/users/activities?page=1&limit=10')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        const response = body as ApiBody<{
          activities: Array<{
            id: string;
            type: string;
            title: string;
            amount: number;
            status: string;
            statusLabel: string;
            reference: string;
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
        expect(response.message).toBe('User activities retrieved successfully');
        expect(response.pagination).toEqual({
          page: 1,
          limit: 10,
          total: 1,
          pages: 1,
        });
        expect(response.data.activities).toContainEqual(
          expect.objectContaining({
            id: airtimeBody.data.transaction.id,
            type: 'AIRTIME',
            title: 'Airtime purchase',
            amount: airtimeAmount,
            status: 'COMPLETED',
            statusLabel: 'Successful',
          }),
        );
      });

    await request(app.getHttpServer())
      .get('/api/v1/transactions?page=1&limit=10')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        const response = body as ApiBody<{
          transactions: Array<{ id: string; type: string; amount: number }>;
        }> & {
          pagination: {
            page: number;
            limit: number;
            total: number;
            pages: number;
          };
        };
        expect(response.status).toBe('success');
        expect(response.message).toBe('Transactions retrieved successfully');
        expect(response.pagination).toEqual({
          page: 1,
          limit: 10,
          total: 1,
          pages: 1,
        });
        expect(response.data.transactions).toContainEqual(
          expect.objectContaining({
            id: airtimeBody.data.transaction.id,
            type: 'AIRTIME',
            amount: airtimeAmount,
          }),
        );
      });
  });

  async function cleanupTestData() {
    const users = await prisma.user.findMany({
      where: { email: testUser.email },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);

    await prisma.emailVerification.deleteMany({
      where: { email: testUser.email },
    });

    if (userIds.length > 0) {
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
  }
});
