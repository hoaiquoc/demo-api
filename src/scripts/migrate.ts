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
        [status] NVARCHAR(16) NOT NULL CONSTRAINT DF_Transactions_Status DEFAULT ('Completed'),
        [note] NVARCHAR(MAX) NULL,
        [createdBy] NVARCHAR(128) NOT NULL
      )
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'${fullName}')
        AND name = 'status'
    )
    BEGIN
      ALTER TABLE ${fullName}
      ADD [status] NVARCHAR(16) NOT NULL CONSTRAINT DF_Transactions_Status DEFAULT ('Completed');
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

async function ensureAccountsTable(pool: sql.ConnectionPool, fullName: string) {
  await pool.request().query(`
    IF OBJECT_ID(N'${fullName}', N'U') IS NULL
    BEGIN
      CREATE TABLE ${fullName} (
        [id] NVARCHAR(64) NOT NULL PRIMARY KEY,
        [name] NVARCHAR(128) NOT NULL,
        [type] NVARCHAR(64) NOT NULL,
        [initialBalance] BIGINT NOT NULL,
        [color] NVARCHAR(32) NOT NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT DF_Accounts_CreatedAt DEFAULT (SYSUTCDATETIME())
      )
    END
  `);
}

async function ensureCategoriesTable(pool: sql.ConnectionPool, fullName: string) {
  await pool.request().query(`
    IF OBJECT_ID(N'${fullName}', N'U') IS NULL
    BEGIN
      CREATE TABLE ${fullName} (
        [id] NVARCHAR(64) NOT NULL PRIMARY KEY,
        [name] NVARCHAR(128) NOT NULL,
        [type] NVARCHAR(16) NOT NULL,
        [icon] NVARCHAR(8) NOT NULL,
        [color] NVARCHAR(64) NOT NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT DF_Categories_CreatedAt DEFAULT (SYSUTCDATETIME())
      )
    END
  `);
}

async function upsertCategory(
  pool: sql.ConnectionPool,
  fullName: string,
  input: { id: string; name: string; type: string; icon: string; color: string },
) {
  await pool
    .request()
    .input('id', sql.NVarChar(64), input.id)
    .input('name', sql.NVarChar(128), input.name)
    .input('type', sql.NVarChar(16), input.type)
    .input('icon', sql.NVarChar(8), input.icon)
    .input('color', sql.NVarChar(64), input.color)
    .query(`
      MERGE ${fullName} AS target
      USING (SELECT @id AS id) AS source
      ON target.id = source.id
      WHEN MATCHED THEN
        UPDATE SET
          [name] = @name,
          [type] = @type,
          [icon] = @icon,
          [color] = @color
      WHEN NOT MATCHED THEN
        INSERT ([id], [name], [type], [icon], [color])
        VALUES (@id, @name, @type, @icon, @color);
    `);
}

async function upsertAccount(
  pool: sql.ConnectionPool,
  fullName: string,
  input: { id: string; name: string; type: string; initialBalance: number; color: string },
) {
  await pool
    .request()
    .input('id', sql.NVarChar(64), input.id)
    .input('name', sql.NVarChar(128), input.name)
    .input('type', sql.NVarChar(64), input.type)
    .input('initialBalance', sql.BigInt, Math.round(input.initialBalance))
    .input('color', sql.NVarChar(32), input.color)
    .query(`
      MERGE ${fullName} AS target
      USING (SELECT @id AS id) AS source
      ON target.id = source.id
      WHEN MATCHED THEN
        UPDATE SET
          [name] = @name,
          [type] = @type,
          [initialBalance] = @initialBalance,
          [color] = @color
      WHEN NOT MATCHED THEN
        INSERT ([id], [name], [type], [initialBalance], [color])
        VALUES (@id, @name, @type, @initialBalance, @color);
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
  const accountsTable = getSchemaAndTable('MSSQL_SCHEMA', 'MSSQL_ACCOUNTS_TABLE', 'Accounts');
  const categoriesTable = getSchemaAndTable('MSSQL_SCHEMA', 'MSSQL_CATEGORIES_TABLE', 'Categories');

  const pool = await getMssqlPool();

  await ensureSchema(pool, usersTable.schema);
  await ensureUsersTable(pool, usersTable.full);
  await ensureTransactionsTable(pool, transactionsTable.full);
  await ensureAccountsTable(pool, accountsTable.full);
  await ensureCategoriesTable(pool, categoriesTable.full);

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

  await upsertAccount(pool, accountsTable.full, {
    id: 'cash',
    name: 'Tiền mặt',
    type: 'Ví cá nhân',
    initialBalance: 2500000,
    color: 'bg-emerald-500',
  });

  await upsertAccount(pool, accountsTable.full, {
    id: 'bank',
    name: 'VCB',
    type: 'Tài khoản ngân hàng',
    initialBalance: 12000000,
    color: 'bg-sky-500',
  });

  await upsertAccount(pool, accountsTable.full, {
    id: 'travel',
    name: 'Quỹ du lịch',
    type: 'Ngân sách mục tiêu',
    initialBalance: 5000000,
    color: 'bg-violet-500',
  });

  await upsertCategory(pool, categoriesTable.full, {
    id: 'salary',
    name: 'Lương',
    type: 'Income',
    icon: 'LU',
    color: 'bg-emerald-100 text-emerald-700',
  });

  await upsertCategory(pool, categoriesTable.full, {
    id: 'freelance',
    name: 'Freelance',
    type: 'Income',
    icon: 'FR',
    color: 'bg-cyan-100 text-cyan-700',
  });

  await upsertCategory(pool, categoriesTable.full, {
    id: 'food',
    name: 'Ăn uống',
    type: 'Expense',
    icon: 'AN',
    color: 'bg-orange-100 text-orange-700',
  });

  await upsertCategory(pool, categoriesTable.full, {
    id: 'transport',
    name: 'Đi lại',
    type: 'Expense',
    icon: 'XE',
    color: 'bg-sky-100 text-sky-700',
  });

  await upsertCategory(pool, categoriesTable.full, {
    id: 'shopping',
    name: 'Mua sắm',
    type: 'Expense',
    icon: 'MS',
    color: 'bg-pink-100 text-pink-700',
  });

  await upsertCategory(pool, categoriesTable.full, {
    id: 'utilities',
    name: 'Hóa đơn',
    type: 'Expense',
    icon: 'HD',
    color: 'bg-violet-100 text-violet-700',
  });

  await upsertCategory(pool, categoriesTable.full, {
    id: 'transfer',
    name: 'Chuyển tiền',
    type: 'Expense',
    icon: 'CT',
    color: 'bg-slate-100 text-slate-700',
  });

  process.stdout.write('Migration completed.\n');
}

void main()
  .catch((error) => {
    process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => closeMssqlPool());
