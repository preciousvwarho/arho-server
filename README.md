# Trash4Cash API

Trash4Cash is a NestJS API for a recycling rewards platform. Users submit
recyclable items for pickup, administrators review each pickup request, and
approved deposits credit a points wallet. The wallet is intended to fund
airtime, data, cable TV, electricity, and bank transfer services.

This repository is the Prisma-based NestJS port of the original Express
server. The port keeps the existing MongoDB storage model while separating
business domains into focused Nest modules.

## Current Porting Status

Implemented:

- NestJS application bootstrap with global validation and CORS
- Swagger/OpenAPI documentation at `/docs`
- MongoDB data model using Prisma
- JWT user registration, login, profile, and transaction PIN management
- Separate JWT strategy for administrators
- Permission-protected admin routes
- Public location catalogue routes
- Public recyclable item catalogue routes
- User deposit submission and history
- Deposit reward snapshots for stable historical pricing
- Atomic admin deposit credit and rejection processing
- User wallet transaction history
- Cloudinary-backed multipart image uploads
- OTP email verification with hashed OTP storage
- Admin and location CRUD management endpoints
- Admin user management, auth profile, password change, and analytics endpoints
- Multipart item creation and item management endpoints
- User profile update endpoint
- Google ID-token login for existing users
- VTPass utility payment adapter routes
- Flutterwave bank and transfer adapter routes
- Health endpoint at `/api/v1/health`

Still to port:

- Payment-provider sandbox callbacks and webhooks
- Full integration tests for provider success/failure paths
- Production-grade admin invite and password-reset flow

## Architecture

```text
src/
  common/
    decorators/       Shared request decorators
    guards/           User JWT, admin JWT, and permission guards
    types/            Shared request and pagination types
    utils/            Shared utility functions
  database/           Prisma lifecycle integration
  modules/
    admins/           Admin auth, item creation, deposit processing
    auth/             User auth and transaction PINs
    deposits/         Pickup request submission and reward statistics
    email-verification/
    items/            Recyclable item catalogue
    locations/        Country, state, and pickup area catalogue
    payments/         VTPass and Flutterwave adapters
    transactions/     Wallet ledger history
    uploads/          Cloudinary-backed image uploads
    users/            User profiles
  app.module.ts
  main.ts
prisma/
  schema.prisma       MongoDB Prisma schema
```

## Important Domain Rules

- Item point values and weights are copied into a deposit request when the
  user submits it. Changing the item catalogue later does not alter historical
  rewards.
- A deposit transitions from `PENDING` to either `CREDITED` or `REJECTED`.
- Crediting a deposit and updating the user's wallet happen in one Prisma
  transaction.
- MongoDB transactions require a replica set, including during local
  development when testing deposit approval.
- User tokens and admin tokens are distinct and cannot be used
  interchangeably.
- There is deliberately no hard-coded default administrator password.

## Setup

Requirements:

- Node.js 18 or newer
- Yarn 1.x
- MongoDB replica set for transaction-backed workflows
- Prisma ORM `6.19.x` while using MongoDB. Prisma ORM 7 does not yet support
  MongoDB.

Install dependencies:

```bash
yarn install
```

Create a local environment file:

```bash
cp .env.example .env
```

Generate the Prisma client:

```bash
yarn prisma:generate
```

Create the local seed data:

```bash
yarn seed
```

The seed creates:

- a super-admin account
- Nigeria and Lagos location records
- Lagos pickup areas
- starter recyclable item types

For repeatable local credentials, add these values to `.env` before running
the seed:

```env
SEED_ADMIN_EMAIL=admin@trash4cash.local
SEED_ADMIN_USERNAME=superadmin
SEED_ADMIN_PASSWORD=ChangeMe123!
```

If `SEED_ADMIN_PASSWORD` is empty and no admin exists, the seed generates a
temporary password and prints it once.

Start the development server:

```bash
yarn start:dev
```

The API runs at `http://localhost:3000/api/v1`. Swagger UI is available at
`http://localhost:3000/docs`.

## Environment Variables

See [.env.example](./.env.example) for the complete template.

Core variables:

| Variable           | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| `DATABASE_URL`     | MongoDB connection URL                           |
| `JWT_SECRET`       | Secret used to sign user and admin JWTs          |
| `JWT_EXPIRES_IN`   | JWT lifetime, such as `30d`                      |
| `BCRYPT_ROUNDS`    | Password and PIN hashing cost                    |
| `PORT`             | HTTP port, defaults to `3000`                    |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for ID-token verification |
| `CLOUDINARY_*`     | Cloudinary upload credentials                    |
| `VTPASS_*`         | VTPass API credentials                           |
| `FLW_*`            | Flutterwave API credentials                      |

## API Overview

System:

- `GET /api/v1/health`
- `GET /docs`

User authentication:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/google`
- `POST /api/v1/auth/pin`
- `POST /api/v1/auth/pin/update`
- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`

Email verification:

- `POST /api/v1/email/send-otp`
- `POST /api/v1/email/resend-otp`
- `POST /api/v1/email/verify-otp`

Uploads:

- `POST /api/v1/uploads/image`

Catalogue:

- `GET /api/v1/locations/countries`
- `GET /api/v1/locations/countries/:countryId/states`
- `GET /api/v1/locations/states/:stateId/areas`
- `GET /api/v1/items`
- `GET /api/v1/items/:id`
- `POST /api/v1/items`
- `PATCH /api/v1/items/:id`
- `PATCH /api/v1/items/:id/toggle-status`
- `DELETE /api/v1/items/:id`
- `POST /api/v1/locations/countries`
- `PATCH /api/v1/locations/countries/:id`
- `DELETE /api/v1/locations/countries/:id`
- `POST /api/v1/locations/states`
- `PATCH /api/v1/locations/states/:id`
- `DELETE /api/v1/locations/states/:id`
- `POST /api/v1/locations/areas`
- `PATCH /api/v1/locations/areas/:id`
- `DELETE /api/v1/locations/areas/:id`

Deposits and wallet:

- `POST /api/v1/deposits`
- `GET /api/v1/deposits`
- `GET /api/v1/deposits/stats`
- `GET /api/v1/deposits/:id`
- `GET /api/v1/transactions`
- `GET /api/v1/transactions/:id`

Admin:

- `POST /api/v1/admin/auth/login`
- `POST /api/v1/admin/auth/logout`
- `GET /api/v1/admin/auth/me`
- `PATCH /api/v1/admin/auth/change-password`
- `POST /api/v1/admin/admins`
- `GET /api/v1/admin/admins`
- `GET /api/v1/admin/admins/:id`
- `PATCH /api/v1/admin/admins/:id`
- `PATCH /api/v1/admin/admins/:id/toggle-status`
- `DELETE /api/v1/admin/admins/:id`
- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/:userId/toggle-status`
- `GET /api/v1/admin/stats`
- `GET /api/v1/admin/deposits`
- `PATCH /api/v1/admin/deposits/:id/status`

Payment services:

- `GET /api/v1/services/network-providers`
- `GET /api/v1/services/data-plans/:network`
- `GET /api/v1/services/cable-providers`
- `GET /api/v1/services/cable-packages/:provider`
- `GET /api/v1/services/electricity-providers`
- `GET /api/v1/services/banks`
- `POST /api/v1/services/airtime`
- `POST /api/v1/services/data`
- `POST /api/v1/services/cable-tv`
- `POST /api/v1/services/electricity`
- `POST /api/v1/services/initiate-transfer`
- `POST /api/v1/services/transfer`

Protected routes accept an `Authorization: Bearer <token>` header.

## Useful Commands

```bash
yarn build
yarn lint
yarn test
yarn prisma:generate
yarn prisma:validate
yarn seed
```

Use MongoDB Compass or `mongosh` to inspect local MongoDB data. Prisma Studio
does not currently support MongoDB.

## Payment Notes

The original Express project contained both Flutterwave and Paystack transfer
experiments. This NestJS port keeps Flutterwave as the active transfer adapter
and uses VTPass for utility purchases. Live payment testing requires sandbox
credentials in `.env`.
