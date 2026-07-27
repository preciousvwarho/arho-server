const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const cleanup = process.argv.includes('--cleanup');

const roleMap = {
  user: 'USER',
  agent: 'AGENT',
  admin: 'ADMIN',
  moderator: 'MODERATOR',
  super_admin: 'SUPER_ADMIN',
};

const permissionMap = {
  manage_users: 'MANAGE_USERS',
  manage_deposits: 'MANAGE_DEPOSITS',
  manage_locations: 'MANAGE_LOCATIONS',
  view_analytics: 'VIEW_ANALYTICS',
  manage_admins: 'MANAGE_ADMINS',
  system_settings: 'SYSTEM_SETTINGS',
};

const depositStatusMap = {
  pending: 'PENDING',
  in_progress: 'IN_PROGRESS',
  rejected: 'REJECTED',
  credited: 'CREDITED',
};

const cleanupFields = {
  users: [
    'password',
    'transactionPin',
    'country',
    'state',
    'regStage',
    'lastLogin',
    'loginType',
    '__v',
  ],
  admins: ['password', 'lastLogin', '__v'],
  states: ['country', 'createdBy', '__v'],
  areas: ['state', 'country', 'createdBy', '__v'],
  items: ['itemName', 'weight', 'amount', 'image', 'imageTwo', '__v'],
  depositrequests: ['user', 'item', 'location', 'image', '__v'],
  countries: ['createdBy', '__v'],
};

function objectIdValue(value) {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'string') {
    return /^[a-f\d]{24}$/i.test(value) ? { $oid: value } : undefined;
  }
  if (typeof value === 'object' && typeof value.$oid === 'string') {
    return value;
  }
  return undefined;
}

function dateValue(value) {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'object' && value.$date) {
    return value;
  }
  return value;
}

function compact(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}

function sameValue(current, desired) {
  return JSON.stringify(current ?? null) === JSON.stringify(desired ?? null);
}

function plannedSet(document, desiredSet) {
  return Object.fromEntries(
    Object.entries(desiredSet).filter(
      ([field, desired]) => !sameValue(document[field], desired),
    ),
  );
}

function hasValidCustomLocation(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (typeof value.address !== 'string' || !value.address.trim()) {
    return false;
  }
  if (!value.geometry || typeof value.geometry !== 'object') {
    return false;
  }
  return (
    value.geometry.type === 'Point' &&
    Array.isArray(value.geometry.coordinates) &&
    value.geometry.coordinates.length === 2 &&
    value.geometry.coordinates.every((coordinate) => typeof coordinate === 'number')
  );
}

function upperMapped(value, map) {
  if (typeof value !== 'string') {
    return undefined;
  }
  return map[value] ?? value;
}

async function find(collection, filter = {}) {
  const result = await prisma.$runCommandRaw({ find: collection, filter });
  return result.cursor.firstBatch;
}

async function updateOne(collection, id, set) {
  if (!Object.keys(set).length) {
    return 0;
  }

  if (!apply) {
    return 1;
  }

  const result = await prisma.$runCommandRaw({
    update: collection,
    updates: [
      {
        q: { _id: id },
        u: { $set: set },
      },
    ],
  });
  return result.nModified ?? result.n ?? 0;
}

async function unsetOne(collection, id, fields) {
  if (!fields.length) {
    return 0;
  }

  if (!apply) {
    return 1;
  }

  const result = await prisma.$runCommandRaw({
    update: collection,
    updates: [
      {
        q: { _id: id },
        u: {
          $unset: Object.fromEntries(fields.map((field) => [field, ''])),
        },
      },
    ],
  });
  return result.nModified ?? result.n ?? 0;
}

async function cleanupCollection(collection, fields) {
  const documents = await find(collection);
  let planned = 0;
  let updated = 0;

  for (const document of documents) {
    const fieldsToRemove = fields.filter((field) =>
      Object.prototype.hasOwnProperty.call(document, field),
    );

    if (fieldsToRemove.length) {
      planned += 1;
      updated += await unsetOne(collection, document._id, fieldsToRemove);
    }
  }

  return { scanned: documents.length, planned, updated };
}

async function cleanupLegacyFields() {
  const result = { mode: apply ? 'cleanup-apply' : 'cleanup-dry-run' };

  for (const [collection, fields] of Object.entries(cleanupFields)) {
    result[collection] = await cleanupCollection(collection, fields);
  }

  return result;
}

async function migrateUsers() {
  const users = await find('users');
  let planned = 0;
  let updated = 0;

  for (const user of users) {
    const set = plannedSet(user, compact({
      passwordHash: user.passwordHash ?? user.password,
      transactionPinHash: user.transactionPinHash ?? user.transactionPin,
      countryId: user.countryId ?? objectIdValue(user.country),
      stateId: user.stateId ?? objectIdValue(user.state),
      registrationStage: user.registrationStage ?? user.regStage,
      role: upperMapped(user.role, roleMap),
      isEmailVerified:
        user.isEmailVerified === undefined ? false : user.isEmailVerified,
      pushNotificationsEnabled:
        user.pushNotificationsEnabled === undefined
          ? true
          : user.pushNotificationsEnabled,
      lastLoginAt: user.lastLoginAt ?? dateValue(user.lastLogin),
    }));

    if (Object.keys(set).length) {
      planned += 1;
      updated += await updateOne('users', user._id, set);
    }
  }

  return { scanned: users.length, planned, updated };
}

async function migrateAdmins() {
  const admins = await find('admins');
  let planned = 0;
  let updated = 0;

  for (const admin of admins) {
    const set = plannedSet(admin, compact({
      passwordHash: admin.passwordHash ?? admin.password,
      role: upperMapped(admin.role, roleMap),
      permissions: Array.isArray(admin.permissions)
        ? admin.permissions.map((permission) =>
            upperMapped(permission, permissionMap),
          )
        : undefined,
      lastLoginAt: admin.lastLoginAt ?? dateValue(admin.lastLogin),
    }));

    if (Object.keys(set).length) {
      planned += 1;
      updated += await updateOne('admins', admin._id, set);
    }
  }

  return { scanned: admins.length, planned, updated };
}

async function migrateLocations() {
  const states = await find('states');
  const areas = await find('areas');
  let planned = 0;
  let updated = 0;

  for (const state of states) {
    const set = plannedSet(state, compact({
      countryId: state.countryId ?? objectIdValue(state.country),
    }));
    if (Object.keys(set).length) {
      planned += 1;
      updated += await updateOne('states', state._id, set);
    }
  }

  for (const area of areas) {
    const set = plannedSet(area, compact({
      stateId: area.stateId ?? objectIdValue(area.state),
      countryId: area.countryId ?? objectIdValue(area.country),
    }));
    if (Object.keys(set).length) {
      planned += 1;
      updated += await updateOne('areas', area._id, set);
    }
  }

  return { scanned: states.length + areas.length, planned, updated };
}

async function migrateItems() {
  const items = await find('items');
  let planned = 0;
  let updated = 0;

  for (const item of items) {
    const set = plannedSet(item, compact({
      name: item.name ?? item.itemName,
      weightKg: item.weightKg ?? item.weight,
      pointValue: item.pointValue ?? item.amount,
      imageUrl: item.imageUrl ?? item.image?.url,
      imageId: item.imageId ?? item.image?.publicId,
      imageTwoUrl: item.imageTwoUrl ?? item.imageTwo?.url,
      imageTwoId: item.imageTwoId ?? item.imageTwo?.publicId,
    }));

    if (Object.keys(set).length) {
      planned += 1;
      updated += await updateOne('items', item._id, set);
    }
  }

  return { scanned: items.length, planned, updated };
}

async function migrateDeposits() {
  const [deposits, items] = await Promise.all([
    find('depositrequests'),
    find('items'),
  ]);
  const itemsById = new Map(
    items.map((item) => [
      typeof item._id?.$oid === 'string' ? item._id.$oid : String(item._id),
      item,
    ]),
  );
  let planned = 0;
  let updated = 0;

  for (const deposit of deposits) {
    const itemId = objectIdValue(deposit.itemId ?? deposit.item);
    const item = itemId?.$oid ? itemsById.get(itemId.$oid) : undefined;
    const hasLocation = Boolean(deposit.locationId ?? deposit.location);
    const customLocation =
      deposit.customLocation && !hasValidCustomLocation(deposit.customLocation)
        ? hasLocation
          ? null
          : {
              address: 'Legacy custom pickup location',
              geometry: {
                type: 'Point',
                coordinates: [],
              },
            }
        : undefined;
    const set = plannedSet(deposit, compact({
      userId: deposit.userId ?? objectIdValue(deposit.user),
      itemId,
      locationId: deposit.locationId ?? objectIdValue(deposit.location),
      customLocation,
      weightKg: deposit.weightKg ?? deposit.weight ?? item?.weightKg ?? item?.weight,
      pointValue:
        deposit.pointValue ?? deposit.amount ?? item?.pointValue ?? item?.amount,
      imageUrl: deposit.imageUrl ?? deposit.image?.url,
      imageId: deposit.imageId ?? deposit.image?.publicId,
      status: upperMapped(deposit.status, depositStatusMap),
      processedById:
        deposit.processedById ?? objectIdValue(deposit.processedBy),
      pickupArrivedAt:
        deposit.pickupArrivedAt ?? dateValue(deposit.arrivedAt),
    }));

    if (Object.keys(set).length) {
      planned += 1;
      updated += await updateOne('depositrequests', deposit._id, set);
    }
  }

  return { scanned: deposits.length, planned, updated };
}

async function main() {
  if (cleanup) {
    const result = await cleanupLegacyFields();
    console.log(JSON.stringify(result, null, 2));
    if (!apply) {
      console.log(
        'Cleanup dry run only. Re-run with --cleanup --apply to remove legacy fields.',
      );
    }
    return;
  }

  const result = {
    mode: apply ? 'apply' : 'dry-run',
    users: await migrateUsers(),
    admins: await migrateAdmins(),
    locations: await migrateLocations(),
    items: await migrateItems(),
    deposits: await migrateDeposits(),
  };

  console.log(JSON.stringify(result, null, 2));
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write these updates.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
