CREATE TABLE [dbo].[Users] (
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
);

CREATE TABLE [dbo].[Accounts] (
  [id] NVARCHAR(64) NOT NULL PRIMARY KEY,
  [name] NVARCHAR(128) NOT NULL,
  [type] NVARCHAR(64) NOT NULL,
  [initialBalance] BIGINT NOT NULL,
  [color] NVARCHAR(32) NOT NULL,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT DF_Accounts_CreatedAt DEFAULT (SYSUTCDATETIME())
);

CREATE TABLE [dbo].[Transactions] (
  [id] NVARCHAR(64) NOT NULL PRIMARY KEY,
  [title] NVARCHAR(255) NOT NULL,
  [accountId] NVARCHAR(64) NOT NULL,
  [categoryId] NVARCHAR(64) NOT NULL,
  [amount] BIGINT NOT NULL,
  [type] NVARCHAR(16) NOT NULL,
  [occurredAt] DATETIME2 NOT NULL,
  [note] NVARCHAR(MAX) NULL,
  [createdBy] NVARCHAR(128) NOT NULL
);

CREATE INDEX IX_Transactions_OccurredAt ON [dbo].[Transactions] ([occurredAt] DESC);
