import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { closeMssqlPool, getMssqlPool, isMssqlEnabled, sql } from '../db/mssql';
import { hashPassword } from '../utils/password';

const DEFAULT_TENANT_ID = 'tenant_default';

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
        [tenantId] NVARCHAR(64) NOT NULL CONSTRAINT DF_Users_TenantId DEFAULT ('${DEFAULT_TENANT_ID}'),
        [email] NVARCHAR(256) NOT NULL UNIQUE,
        [fullName] NVARCHAR(128) NOT NULL,
        [role] NVARCHAR(16) NOT NULL,
        [avatar] NVARCHAR(8) NOT NULL,
        [spaces] INT NOT NULL,
        [isActive] BIT NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT (1),
        [passwordHash] NVARCHAR(256) NOT NULL,
        [passwordSalt] NVARCHAR(256) NOT NULL,
        [passwordIterations] INT NOT NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT (SYSUTCDATETIME())
      )
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'${fullName}')
        AND name = 'tenantId'
    )
    BEGIN
      ALTER TABLE ${fullName}
      ADD [tenantId] NVARCHAR(64) NOT NULL CONSTRAINT DF_Users_TenantId DEFAULT ('${DEFAULT_TENANT_ID}');
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'${fullName}')
        AND name = 'isActive'
    )
    BEGIN
      ALTER TABLE ${fullName}
      ADD [isActive] BIT NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT (1);
    END
  `);
}

async function ensureTenantsTable(pool: sql.ConnectionPool, fullName: string) {
  await pool.request().query(`
    IF OBJECT_ID(N'${fullName}', N'U') IS NULL
    BEGIN
      CREATE TABLE ${fullName} (
        [id] NVARCHAR(64) NOT NULL PRIMARY KEY,
        [name] NVARCHAR(128) NOT NULL,
        [ownerEmail] NVARCHAR(256) NOT NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT DF_Tenants_CreatedAt DEFAULT (SYSUTCDATETIME())
      )
    END
  `);
}

async function ensureSessionsTable(pool: sql.ConnectionPool, fullName: string) {
  await pool.request().query(`
    IF OBJECT_ID(N'${fullName}', N'U') IS NULL
    BEGIN
      CREATE TABLE ${fullName} (
        [token] NVARCHAR(128) NOT NULL PRIMARY KEY,
        [userId] NVARCHAR(64) NOT NULL,
        [tenantId] NVARCHAR(64) NOT NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT DF_Sessions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        [expiresAt] DATETIME2 NOT NULL
      )
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_Sessions_UserId'
        AND object_id = OBJECT_ID(N'${fullName}')
    )
    BEGIN
      CREATE INDEX IX_Sessions_UserId ON ${fullName} ([userId])
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_Sessions_TenantId'
        AND object_id = OBJECT_ID(N'${fullName}')
    )
    BEGIN
      CREATE INDEX IX_Sessions_TenantId ON ${fullName} ([tenantId])
    END
  `);
}

async function ensureTransactionsTable(pool: sql.ConnectionPool, fullName: string) {
  await pool.request().query(`
    IF OBJECT_ID(N'${fullName}', N'U') IS NULL
    BEGIN
      CREATE TABLE ${fullName} (
        [id] NVARCHAR(64) NOT NULL PRIMARY KEY,
        [tenantId] NVARCHAR(64) NOT NULL CONSTRAINT DF_Transactions_TenantId DEFAULT ('${DEFAULT_TENANT_ID}'),
        [title] NVARCHAR(255) NOT NULL,
        [accountId] NVARCHAR(64) NOT NULL,
        [categoryId] NVARCHAR(64) NOT NULL,
        [amount] BIGINT NOT NULL,
        [type] NVARCHAR(16) NOT NULL,
        [occurredAt] DATETIME2 NOT NULL,
        [status] NVARCHAR(16) NOT NULL CONSTRAINT DF_Transactions_Status DEFAULT ('Completed'),
        [adjustmentOfId] NVARCHAR(64) NULL,
        [adjustedById] NVARCHAR(64) NULL,
        [assetQuantity] DECIMAL(18, 6) NULL,
        [assetUnit] NVARCHAR(16) NULL,
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
        AND name = 'tenantId'
    )
    BEGIN
      ALTER TABLE ${fullName}
      ADD [tenantId] NVARCHAR(64) NOT NULL CONSTRAINT DF_Transactions_TenantId DEFAULT ('${DEFAULT_TENANT_ID}');
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
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'${fullName}')
        AND name = 'adjustmentOfId'
    )
    BEGIN
      ALTER TABLE ${fullName}
      ADD [adjustmentOfId] NVARCHAR(64) NULL;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'${fullName}')
        AND name = 'adjustedById'
    )
    BEGIN
      ALTER TABLE ${fullName}
      ADD [adjustedById] NVARCHAR(64) NULL;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'${fullName}')
        AND name = 'assetQuantity'
    )
    BEGIN
      ALTER TABLE ${fullName}
      ADD [assetQuantity] DECIMAL(18, 6) NULL;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'${fullName}')
        AND name = 'assetUnit'
    )
    BEGIN
      ALTER TABLE ${fullName}
      ADD [assetUnit] NVARCHAR(16) NULL;
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

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_Transactions_Tenant_OccurredAt'
        AND object_id = OBJECT_ID(N'${fullName}')
    )
    BEGIN
      CREATE INDEX IX_Transactions_Tenant_OccurredAt
      ON ${fullName} ([tenantId], [occurredAt] DESC)
      INCLUDE ([id], [title], [accountId], [categoryId], [amount], [type], [status], [createdBy], [adjustmentOfId], [adjustedById], [assetQuantity], [assetUnit])
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
        [tenantId] NVARCHAR(64) NOT NULL CONSTRAINT DF_Accounts_TenantId DEFAULT ('${DEFAULT_TENANT_ID}'),
        [name] NVARCHAR(128) NOT NULL,
        [type] NVARCHAR(64) NOT NULL,
        [initialBalance] BIGINT NOT NULL,
        [balance] BIGINT NOT NULL CONSTRAINT DF_Accounts_Balance DEFAULT (0),
        [color] NVARCHAR(32) NOT NULL,
        [assetCode] NVARCHAR(32) NULL,
        [assetQuantity] DECIMAL(18, 6) NULL,
        [assetUnit] NVARCHAR(16) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT DF_Accounts_CreatedAt DEFAULT (SYSUTCDATETIME())
      )
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'${fullName}')
        AND name = 'tenantId'
    )
    BEGIN
      ALTER TABLE ${fullName}
      ADD [tenantId] NVARCHAR(64) NOT NULL CONSTRAINT DF_Accounts_TenantId DEFAULT ('${DEFAULT_TENANT_ID}');
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'${fullName}')
        AND name = 'assetCode'
    )
    BEGIN
      ALTER TABLE ${fullName}
      ADD [assetCode] NVARCHAR(32) NULL;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'${fullName}')
        AND name = 'assetQuantity'
    )
    BEGIN
      ALTER TABLE ${fullName}
      ADD [assetQuantity] DECIMAL(18, 6) NULL;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'${fullName}')
        AND name = 'assetUnit'
    )
    BEGIN
      ALTER TABLE ${fullName}
      ADD [assetUnit] NVARCHAR(16) NULL;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'${fullName}')
        AND name = 'balance'
    )
    BEGIN
      ALTER TABLE ${fullName}
      ADD [balance] BIGINT NOT NULL CONSTRAINT DF_Accounts_Balance DEFAULT (0);
    END
  `);

  const transactionsTable = getSchemaAndTable('MSSQL_SCHEMA', 'MSSQL_TRANSACTIONS_TABLE', 'Transactions').full;

  await pool.request().query(`
    UPDATE a
    SET a.[balance] =
      CASE
        WHEN a.[type] = N'Tiết kiệm vàng' THEN CAST(a.[initialBalance] AS BIGINT)
        ELSE CAST(a.[initialBalance] AS BIGINT)
          + ISNULL((
              SELECT SUM(
                CASE
                  WHEN t.[status] = N'Completed' AND t.[type] = N'Income' THEN CAST(t.[amount] AS BIGINT)
                  WHEN t.[status] = N'Completed' AND t.[type] = N'Expense' THEN -CAST(t.[amount] AS BIGINT)
                  ELSE 0
                END
              )
              FROM ${transactionsTable} t
              WHERE t.[tenantId] = a.[tenantId]
                AND t.[accountId] = a.[id]
            ), 0)
      END
    FROM ${fullName} a
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_Accounts_TenantId'
        AND object_id = OBJECT_ID(N'${fullName}')
    )
    BEGIN
      CREATE INDEX IX_Accounts_TenantId ON ${fullName} ([tenantId])
    END
  `);
}

async function ensureCategoriesTable(pool: sql.ConnectionPool, fullName: string) {
  await pool.request().query(`
    IF OBJECT_ID(N'${fullName}', N'U') IS NULL
    BEGIN
      CREATE TABLE ${fullName} (
        [id] NVARCHAR(64) NOT NULL PRIMARY KEY,
        [tenantId] NVARCHAR(64) NOT NULL CONSTRAINT DF_Categories_TenantId DEFAULT ('${DEFAULT_TENANT_ID}'),
        [name] NVARCHAR(128) NOT NULL,
        [type] NVARCHAR(16) NOT NULL,
        [icon] NVARCHAR(32) NOT NULL,
        [color] NVARCHAR(64) NOT NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT DF_Categories_CreatedAt DEFAULT (SYSUTCDATETIME())
      )
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'${fullName}')
        AND name = 'tenantId'
    )
    BEGIN
      ALTER TABLE ${fullName}
      ADD [tenantId] NVARCHAR(64) NOT NULL CONSTRAINT DF_Categories_TenantId DEFAULT ('${DEFAULT_TENANT_ID}');
    END
  `);

  await pool.request().query(`
    IF EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'${fullName}')
        AND name = 'icon'
        AND max_length < 64
    )
    BEGIN
      ALTER TABLE ${fullName}
      ALTER COLUMN [icon] NVARCHAR(32) NOT NULL;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_Categories_TenantId'
        AND object_id = OBJECT_ID(N'${fullName}')
    )
    BEGIN
      CREATE INDEX IX_Categories_TenantId ON ${fullName} ([tenantId])
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_Categories_Tenant_Type_Name'
        AND object_id = OBJECT_ID(N'${fullName}')
    )
    BEGIN
      CREATE INDEX IX_Categories_Tenant_Type_Name ON ${fullName} ([tenantId], [type], [name])
    END
  `);
}

async function ensureSpendingAlertsTable(pool: sql.ConnectionPool, fullName: string) {
  await pool.request().query(`
    IF OBJECT_ID(N'${fullName}', N'U') IS NULL
    BEGIN
      CREATE TABLE ${fullName} (
        [id] NVARCHAR(64) NOT NULL PRIMARY KEY,
        [tenantId] NVARCHAR(64) NOT NULL,
        [period] NVARCHAR(16) NOT NULL,
        [thresholdAmount] BIGINT NOT NULL CONSTRAINT DF_SpendingAlerts_Threshold DEFAULT (0),
        [createdAt] DATETIME2 NOT NULL CONSTRAINT DF_SpendingAlerts_CreatedAt DEFAULT (SYSUTCDATETIME()),
        [updatedAt] DATETIME2 NOT NULL CONSTRAINT DF_SpendingAlerts_UpdatedAt DEFAULT (SYSUTCDATETIME())
      )
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'UX_SpendingAlerts_Tenant_Period'
        AND object_id = OBJECT_ID(N'${fullName}')
    )
    BEGIN
      CREATE UNIQUE INDEX UX_SpendingAlerts_Tenant_Period ON ${fullName} ([tenantId], [period])
    END
  `);
}

async function ensurePasswordResetTokensTable(pool: sql.ConnectionPool, fullName: string) {
  await pool.request().query(`
    IF OBJECT_ID(N'${fullName}', N'U') IS NULL
    BEGIN
      CREATE TABLE ${fullName} (
        [token] NVARCHAR(128) NOT NULL PRIMARY KEY,
        [userId] NVARCHAR(64) NOT NULL,
        [tenantId] NVARCHAR(64) NOT NULL,
        [expiresAt] DATETIME2 NOT NULL,
        [usedAt] DATETIME2 NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT DF_PasswordResetTokens_CreatedAt DEFAULT (SYSUTCDATETIME())
      )
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_PasswordResetTokens_UserId'
        AND object_id = OBJECT_ID(N'${fullName}')
    )
    BEGIN
      CREATE INDEX IX_PasswordResetTokens_UserId ON ${fullName} ([userId])
    END
  `);
}

async function ensureBudgetsTable(pool: sql.ConnectionPool, fullName: string) {
  await pool.request().query(`
    IF OBJECT_ID(N'${fullName}', N'U') IS NULL
    BEGIN
      CREATE TABLE ${fullName} (
        [id] NVARCHAR(64) NOT NULL PRIMARY KEY,
        [tenantId] NVARCHAR(64) NOT NULL,
        [month] NVARCHAR(7) NOT NULL,
        [scopeType] NVARCHAR(16) NOT NULL,
        [scopeId] NVARCHAR(64) NOT NULL,
        [amount] BIGINT NOT NULL CONSTRAINT DF_Budgets_Amount DEFAULT (0),
        [createdAt] DATETIME2 NOT NULL CONSTRAINT DF_Budgets_CreatedAt DEFAULT (SYSUTCDATETIME()),
        [updatedAt] DATETIME2 NOT NULL CONSTRAINT DF_Budgets_UpdatedAt DEFAULT (SYSUTCDATETIME())
      )
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'UX_Budgets_Tenant_Month_Scope'
        AND object_id = OBJECT_ID(N'${fullName}')
    )
    BEGIN
      CREATE UNIQUE INDEX UX_Budgets_Tenant_Month_Scope ON ${fullName} ([tenantId], [month], [scopeType], [scopeId])
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_Budgets_Tenant_Month'
        AND object_id = OBJECT_ID(N'${fullName}')
    )
    BEGIN
      CREATE INDEX IX_Budgets_Tenant_Month ON ${fullName} ([tenantId], [month])
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
  const tenantsTable = getSchemaAndTable('MSSQL_SCHEMA', 'MSSQL_TENANTS_TABLE', 'Tenants');
  const sessionsTable = getSchemaAndTable('MSSQL_SCHEMA', 'MSSQL_SESSIONS_TABLE', 'Sessions');
  const spendingAlertsTable = getSchemaAndTable('MSSQL_SCHEMA', 'MSSQL_SPENDING_ALERTS_TABLE', 'SpendingAlerts');
  const passwordResetTokensTable = getSchemaAndTable('MSSQL_SCHEMA', 'MSSQL_PASSWORD_RESET_TOKENS_TABLE', 'PasswordResetTokens');
  const budgetsTable = getSchemaAndTable('MSSQL_SCHEMA', 'MSSQL_BUDGETS_TABLE', 'Budgets');

  const pool = await getMssqlPool();

  await ensureSchema(pool, usersTable.schema);
  await ensureTenantsTable(pool, tenantsTable.full);
  await ensureUsersTable(pool, usersTable.full);
  await ensureSessionsTable(pool, sessionsTable.full);
  await ensureTransactionsTable(pool, transactionsTable.full);
  await ensureAccountsTable(pool, accountsTable.full);
  await ensureCategoriesTable(pool, categoriesTable.full);
  await ensureSpendingAlertsTable(pool, spendingAlertsTable.full);
  await ensurePasswordResetTokensTable(pool, passwordResetTokensTable.full);
  await ensureBudgetsTable(pool, budgetsTable.full);

  await pool
    .request()
    .input('id', sql.NVarChar(64), DEFAULT_TENANT_ID)
    .input('name', sql.NVarChar(128), 'Mặc định')
    .input('ownerEmail', sql.NVarChar(256), 'system@local')
    .query(`
      MERGE ${tenantsTable.full} AS target
      USING (SELECT @id AS id) AS source
      ON target.id = source.id
      WHEN MATCHED THEN
        UPDATE SET [name] = @name, [ownerEmail] = @ownerEmail
      WHEN NOT MATCHED THEN
        INSERT ([id], [name], [ownerEmail])
        VALUES (@id, @name, @ownerEmail);
    `);

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

  await upsertCategory(pool, categoriesTable.full, {
    id: 'balance_income',
    name: 'Cân đối (Thu)',
    type: 'Income',
    icon: 'CD',
    color: 'bg-amber-100 text-amber-800',
  });

  await upsertCategory(pool, categoriesTable.full, {
    id: 'balance_expense',
    name: 'Cân đối (Chi)',
    type: 'Expense',
    icon: 'CD',
    color: 'bg-amber-100 text-amber-800',
  });

  process.stdout.write('Migration completed.\n');
}

void main()
  .catch((error) => {
    process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => closeMssqlPool());
