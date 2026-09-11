type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  [key: string]: unknown;
};

export function parseFirebaseServiceAccount(rawValue: string) {
  const parsed = parseJsonOrNestedJson(rawValue);
  return assertFirebaseServiceAccount(parsed);
}

function parseJsonOrNestedJson(rawValue: string) {
  const trimmed = rawValue.trim();

  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch {
    const repaired = escapeControlCharactersInsideStrings(trimmed);
    const parsed = JSON.parse(repaired);
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  }
}

function escapeControlCharactersInsideStrings(value: string) {
  let repaired = '';
  let insideString = false;
  let escaping = false;

  for (const char of value) {
    if (escaping) {
      repaired += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      repaired += char;
      escaping = true;
      continue;
    }

    if (char === '"') {
      insideString = !insideString;
      repaired += char;
      continue;
    }

    if (insideString) {
      if (char === '\n') {
        repaired += '\\n';
        continue;
      }

      if (char === '\r') {
        repaired += '\\r';
        continue;
      }

      if (char === '\t') {
        repaired += '\\t';
        continue;
      }
    }

    repaired += char;
  }

  return repaired;
}

function assertFirebaseServiceAccount(
  value: unknown,
): FirebaseServiceAccount {
  if (!value || typeof value !== 'object') {
    throw new Error('Firebase service account must be a JSON object');
  }

  const serviceAccount = value as Record<string, unknown>;
  const projectId = serviceAccount.project_id;
  const clientEmail = serviceAccount.client_email;
  const privateKey = serviceAccount.private_key;

  if (
    typeof projectId !== 'string' ||
    typeof clientEmail !== 'string' ||
    typeof privateKey !== 'string'
  ) {
    throw new Error(
      'Firebase service account must include project_id, client_email, and private_key',
    );
  }

  return serviceAccount as FirebaseServiceAccount;
}
