import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { closeMssqlPool, getMssqlPool, isMssqlEnabled, sql } from '../db/mssql';
import { hashPassword } from '../utils/password';

function sanitizeIdentifier(value: string, fallback: string) {
  const trimmed = value.trim();
  const cleaned = trimmed.replace(/[^a-zA-Z0-9_]/g, '');
  return cleaned || fallback;
}

function getSchemaAndTable(envSchemaKey: string, envTableKey: string, defaultTable: string) {
  const schema = sanitizeIdentifier(process.env[envSchemaKey] ?? '', 'dbo');
  const table = sanitizeIdentifier(process.env[envTableKey] ?? '', defaultTable);
  return { schema, table, full: `[${schema}].[${table}]` };
}

async function ensureSchema(pool: sql.ConnectionPool, schema: string) {
  await pool.request().input('schema', sql.NVarChar(128), schema).query(`
    IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = @schema)
    BEGIN
      EXEC('CREATE SCHEMA [' + @schema + ']')
    END
  `);
}

async function ensureUsersTable(pool: sql.ConnectionPool, fullName: string) {
  await pool.request().query(`
    IF OBJECT_ID(N'${fullName}', N'U') IS NULL
    BEGIN
      CREATE TABLE ${fullName} (
        [id] NVARCHAR(64) NOT NULL PRIMARY KEY,
        [email] NVARCHAR(256) NOT NULL UNIQUE,
        [fullName] NVARCHAR(128) NOT NULL,
        [role] NVARCHAR(16) NOT NULL,
        [avatar] NVARCHAR(8) NOT NULL,
        [spaces] INT NOT NULL,
        [passwordHash] NVARCHAR(256) NOT NULL,
        [passwordSalt] NVARCHAR(256) NOT NULL,
        [passwordIterations] INT NOT NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT (SYSUTCDATETIME())
      )
    END
  `);
}

async function ensureTransactionsTable(pool: sql.ConnectionPool, fullName: string) {
  await pool.request().query(`
    IF OBJECT_ID(N'${fullName}', N'U') IS NULL
    BEGIN
      CREATE TABLE ${fullName} (
        [id] NVARCHAR(64) NOT NULL PRIMARY KEY,
        [title] NVARCHAR(255) NOT NULL,
        [accountId] NVARCHAR(64) NOT NULL,
        [categoryId] NVARCHAR(64) NOT NULL,
        [amount] BIGINT NOT NULL,
        [type] NVARCHAR(16) NOT NULL,
        [occurredAt] DATETIME2 NOT NULL,
        [note] NVARCHAR(MAX) NULL,
        [createdBy] NVARCHAR(128) NOT NULL
      )
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_Transactions_OccurredAt'
        AND object_id = OBJECT_ID(N'${fullName}')
    )
    BEGIN
      CREATE INDEX IX_Transactions_OccurredAt ON ${fullName} ([occurredAt] DESC)
    END
  `);
}

async function upsertUser(pool: sql.ConnectionPool, fullName: string, input: { email: string; fullName: string; role: string; avatar: string; spaces: number; password: string }) {
  const password = hashPassword(input.password);
  const id = randomUUID();

  await pool
    .request()
    .input('email', sql.NVarChar(256), input.email)
    .input('id', sql.NVarChar(64), id)
    .input('fullName', sql.NVarChar(128), input.fullName)
    .input('role', sql.NVarChar(16), input.role)
    .input('avatar', sql.NVarChar(8), input.avatar)
    .input('spaces', sql.Int, input.spaces)
    .input('passwordHash', sql.NVarChar(256), password.hash)
    .input('passwordSalt', sql.NVarChar(256), password.salt)
    .input('passwordIterations', sql.Int, password.iterations)
    .query(`
      MERGE ${fullName} AS target
      USING (SELECT @email AS email) AS source
      ON LOWER(target.email) = LOWER(source.email)
      WHEN MATCHED THEN
        UPDATE SET
          [fullName] = @fullName,
          [role] = @role,
          [avatar] = @avatar,
          [spaces] = @spaces,
          [passwordHash] = @passwordHash,
          [passwordSalt] = @passwordSalt,
          [passwordIterations] = @passwordIterations
      WHEN NOT MATCHED THEN
        INSERT ([id], [email], [fullName], [role], [avatar], [spaces], [passwordHash], [passwordSalt], [passwordIterations])
        VALUES (@id, @email, @fullName, @role, @avatar, @spaces, @passwordHash, @passwordSalt, @passwordIterations);
    `);
}

async function main() {
  if (!isMssqlEnabled()) {
    process.stderr.write('MSSQL is not enabled. Set MSSQL_SERVER and MSSQL_DATABASE in .env\n');
    process.exitCode = 1;
    return;
  }

  const usersTable = getSchemaAndTable('MSSQL_SCHEMA', 'MSSQL_USERS_TABLE', 'Users');
  const transactionsTable = getSchemaAndTable('MSSQL_SCHEMA', 'MSSQL_TRANSACTIONS_TABLE', 'Transactions');

  const pool = await getMssqlPool();

  await ensureSchema(pool, usersTable.schema);
  await ensureUsersTable(pool, usersTable.full);
  await ensureTransactionsTable(pool, transactionsTable.full);

  await upsertUser(pool, usersTable.full, {
    email: 'quoc@chitieu.vn',
    fullName: 'Quốc',
    role: 'Owner',
    avatar: 'QC',
    spaces: 1,
    password: '123456',
  });

  await upsertUser(pool, usersTable.full, {
    email: 'quynh@chitieu.vn',
    fullName: 'Quỳnh',
    role: 'Editor',
    avatar: 'QH',
    spaces: 1,
    password: '123456',
  });

  process.stdout.write('Migration completed.\n');
}

void main()
  .catch((error) => {
    process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => closeMssqlPool());
