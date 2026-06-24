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

export function getAccountsTableName() {
  const schema = (process.env.MSSQL_SCHEMA?.trim() || 'dbo').replace(/[^a-zA-Z0-9_]/g, '');
  const table = (process.env.MSSQL_ACCOUNTS_TABLE?.trim() || 'Accounts').replace(/[^a-zA-Z0-9_]/g, '');
  return `[${schema}].[${table}]`;
}

export function getCategoriesTableName() {
  const schema = (process.env.MSSQL_SCHEMA?.trim() || 'dbo').replace(/[^a-zA-Z0-9_]/g, '');
  const table = (process.env.MSSQL_CATEGORIES_TABLE?.trim() || 'Categories').replace(/[^a-zA-Z0-9_]/g, '');
  return `[${schema}].[${table}]`;
}

export function getTenantsTableName() {
  const schema = (process.env.MSSQL_SCHEMA?.trim() || 'dbo').replace(/[^a-zA-Z0-9_]/g, '');
  const table = (process.env.MSSQL_TENANTS_TABLE?.trim() || 'Tenants').replace(/[^a-zA-Z0-9_]/g, '');
  return `[${schema}].[${table}]`;
}

export function getSessionsTableName() {
  const schema = (process.env.MSSQL_SCHEMA?.trim() || 'dbo').replace(/[^a-zA-Z0-9_]/g, '');
  const table = (process.env.MSSQL_SESSIONS_TABLE?.trim() || 'Sessions').replace(/[^a-zA-Z0-9_]/g, '');
  return `[${schema}].[${table}]`;
}

export function getSpendingAlertsTableName() {
  const schema = (process.env.MSSQL_SCHEMA?.trim() || 'dbo').replace(/[^a-zA-Z0-9_]/g, '');
  const table = (process.env.MSSQL_SPENDING_ALERTS_TABLE?.trim() || 'SpendingAlerts').replace(/[^a-zA-Z0-9_]/g, '');
  return `[${schema}].[${table}]`;
}
