import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { EmailService } from '../src/email/email.service';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
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
  token: string;
  user: { id: string; email: string };
};

type CapturedEmail = {
  to: string;
  subject: string;
  html: string;
};

describe('Auth and email smoke flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const capturedEmails: CapturedEmail[] = [];
  const suffix = Date.now().toString().slice(-8);
  const testUser = {
    fullName: 'Smoke Test User',
    email: `smoke-${suffix}@example.com`,
    phoneNumber: `080${suffix}`,
    password: 'SecurePass1!',
  };

  beforeAll(async () => {
    const emailMock = {
      send: jest.fn(async (args: CapturedEmail) => {
        capturedEmails.push(args);
      }),
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

  it('registers, verifies email, logs in, refreshes, creates a PIN, saves push token, and lists notifications', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser);

    if (registerResponse.status !== 201) {
      throw new Error(JSON.stringify(registerResponse.body));
    }

    const registerBody = registerResponse.body as ApiBody<AuthData>;
    expect(registerBody).toEqual(
      expect.objectContaining({ status: 'success' }),
    );
    expect(registerBody.message).toBe('User registered successfully');
    expect(registerBody.data.accessToken).toEqual(expect.any(String));
    expect(registerBody.data.refreshToken).toEqual(expect.any(String));
    expect(registerBody.data.user.email).toBe(testUser.email);

    await request(app.getHttpServer())
      .post('/api/v1/email/send-otp')
      .send({ email: testUser.email, fullName: testUser.fullName })
      .expect(201)
      .expect(({ body }) => {
        const response = body as ApiBody<{ email: string; expiresIn: string }>;
        expect(response.status).toBe('success');
        expect(response.message).toBe('OTP sent successfully');
        expect(response.data.email).toBe(testUser.email);
      });

    const otpEmail = capturedEmails.find(
      (email) =>
        email.to === testUser.email &&
        email.subject === 'Trash4Cash Email Verification',
    );
    const otp = otpEmail?.html.match(/\b\d{6}\b/)?.[0];
    expect(otp).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/v1/email/verify-otp')
      .send({ email: testUser.email, otp })
      .expect(201)
      .expect(({ body }) => {
        const response = body as ApiBody<{
          email: string;
          isEmailVerified: boolean;
        }>;
        expect(response.status).toBe('success');
        expect(response.message).toBe('Email verified successfully');
        expect(response.data.isEmailVerified).toBe(true);
      });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password })
      .expect(201);

    const loginBody = loginResponse.body as ApiBody<AuthData>;
    expect(loginBody.status).toBe('success');
    expect(loginBody.data.accessToken).toEqual(expect.any(String));
    expect(loginBody.data.refreshToken).toEqual(expect.any(String));

    const refreshResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loginBody.data.refreshToken })
      .expect(201);

    const refreshBody = refreshResponse.body as ApiBody<AuthData>;
    expect(refreshBody.status).toBe('success');
    expect(refreshBody.message).toBe('Token refreshed successfully');
    expect(refreshBody.data.accessToken).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post('/api/v1/auth/pin')
      .set('Authorization', `Bearer ${refreshBody.data.accessToken}`)
      .send({ pin: '1234' })
      .expect(201)
      .expect(({ body }) => {
        const response = body as ApiBody<null>;
        expect(response.status).toBe('success');
        expect(response.message).toBe('Transaction PIN created successfully');
      });

    await request(app.getHttpServer())
      .patch('/api/v1/users/push-token')
      .set('Authorization', `Bearer ${refreshBody.data.accessToken}`)
      .send({ pushToken: 'ExponentPushToken[smoketesttoken]' })
      .expect(200)
      .expect(({ body }) => {
        const response = body as ApiBody<{
          pushNotificationsEnabled: boolean;
        }>;
        expect(response.status).toBe('success');
        expect(response.message).toBe('Push token updated successfully');
        expect(response.data.pushNotificationsEnabled).toBe(true);
      });

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { email: testUser.email },
      select: { pushToken: true },
    });
    expect(updatedUser.pushToken).toBe('ExponentPushToken[smoketesttoken]');

    await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${refreshBody.data.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        const response = body as ApiBody<{ notifications: unknown[] }>;
        expect(response.status).toBe('success');
        expect(response.message).toBe('Notifications retrieved successfully');
        expect(Array.isArray(response.data.notifications)).toBe(true);
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