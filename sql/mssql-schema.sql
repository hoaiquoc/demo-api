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

