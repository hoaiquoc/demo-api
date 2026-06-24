import sql from 'mssql';

type MssqlConfig = {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  connectionTimeoutMs: number;
  requestTimeoutMs: number;
};

function toBoolean(value: string | undefined, fallback: boolean) {
  if (!value?.trim()) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return fallback;
}

function toNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isMssqlEnabled() {
  return Boolean(process.env.MSSQL_SERVER?.trim() && process.env.MSSQL_DATABASE?.trim());
}

export function getMssqlConfig(): MssqlConfig {
  const server = process.env.MSSQL_SERVER?.trim() ?? '';
  const database = process.env.MSSQL_DATABASE?.trim() ?? '';
  const user = process.env.MSSQL_USER?.trim() ?? '';
  const password = process.env.MSSQL_PASSWORD?.trim() ?? '';

  return {
    server,
    port: toNumber(process.env.MSSQL_PORT, 1433),
    database,
    user,
    password,
    encrypt: toBoolean(process.env.MSSQL_ENCRYPT, true),
    trustServerCertificate: toBoolean(process.env.MSSQL_TRUST_SERVER_CERTIFICATE, true),
    connectionTimeoutMs: toNumber(process.env.MSSQL_CONNECTION_TIMEOUT_MS, 15000),
    requestTimeoutMs: toNumber(process.env.MSSQL_REQUEST_TIMEOUT_MS, 15000),
  };
}

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getMssqlPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    const config = getMssqlConfig();

    poolPromise = new sql.ConnectionPool({
      server: config.server,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      options: {
        encrypt: config.encrypt,
        trustServerCertificate: config.trustServerCertificate,
      },
      connectionTimeout: config.connectionTimeoutMs,
      requestTimeout: config.requestTimeoutMs,
    }).connect();
  }

  return poolPromise as Promise<sql.ConnectionPool>;
}

export async function closeMssqlPool(): Promise<void> {
  if (!poolPromise) {
    return;
  }

  try {
    const pool = await poolPromise;
    await pool.close();
  } finally {
    poolPromise = null;
  }
}

export { sql };
