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
- Health endpoint at `/api/v1/health`

Still to port:

- Cloudinary multipart upload endpoint
- OTP email verification
- Google login
- Location administration CRUD
- Admin account management and bootstrap command
- VTPass utility payment adapters
- Flutterwave transfer adapter
- Integration tests backed by a MongoDB replica set

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
    items/            Recyclable item catalogue
    locations/        Country, state, and pickup area catalogue
    transactions/     Wallet ledger history
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

Start the development server:

```bash
yarn start:dev
```

The API runs at `http://localhost:3000/api/v1`. Swagger UI is available at
`http://localhost:3000/docs`.

## Environment Variables

See [.env.example](./.env.example) for the complete template.

Core variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MongoDB connection URL |
| `JWT_SECRET` | Secret used to sign user and admin JWTs |
| `JWT_EXPIRES_IN` | JWT lifetime, such as `30d` |
| `BCRYPT_ROUNDS` | Password and PIN hashing cost |
| `PORT` | HTTP port, defaults to `3000` |

## API Overview

System:

- `GET /api/v1/health`
- `GET /docs`

User authentication:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/pin`
- `POST /api/v1/auth/pin/update`
- `GET /api/v1/users/me`

Catalogue:

- `GET /api/v1/locations/countries`
- `GET /api/v1/locations/countries/:countryId/states`
- `GET /api/v1/locations/states/:stateId/areas`
- `GET /api/v1/items`
- `GET /api/v1/items/:id`

Deposits and wallet:

- `POST /api/v1/deposits`
- `GET /api/v1/deposits`
- `GET /api/v1/deposits/stats`
- `GET /api/v1/deposits/:id`
- `GET /api/v1/transactions`
- `GET /api/v1/transactions/:id`

Admin:

- `POST /api/v1/admin/auth/login`
- `POST /api/v1/admin/items`
- `GET /api/v1/admin/deposits`
- `PATCH /api/v1/admin/deposits/:id/status`

Protected routes accept an `Authorization: Bearer <token>` header.

## Useful Commands

```bash
yarn build
yarn lint
yarn test
yarn prisma:generate
yarn prisma:validate
```

Use MongoDB Compass or `mongosh` to inspect local MongoDB data. Prisma Studio
does not currently support MongoDB.

## Notes For The Remaining Migration

The original Express project contains two transfer implementations:
Flutterwave is active and Paystack is unused. The NestJS port should add a
gateway interface and implement Flutterwave first. VTPass should be split into
its own adapter so utility purchase orchestration remains independent of HTTP
transport details.
# trash4cash-BE
