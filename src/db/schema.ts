export function getTransactionsTableName() {
  const schema = (process.env.MSSQL_SCHEMA?.trim() || 'dbo').replace(/[^a-zA-Z0-9_]/g, '');
  const table = (process.env.MSSQL_TRANSACTIONS_TABLE?.trim() || 'Transactions').replace(/[^a-zA-Z0-9_]/g, '');
  return `[${schema}].[${table}]`;
}

export function getUsersTableName() {
  const schema = (process.env.MSSQL_SCHEMA?.trim() || 'dbo').replace(/[^a-zA-Z0-9_]/g, '');
  const table = (process.env.MSSQL_USERS_TABLE?.trim() || 'Users').replace(/[^a-zA-Z0-9_]/g, '');
  return `[${schema}].[${table}]`;
}
