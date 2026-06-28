import 'dotenv/config';
import { closeMssqlPool, getMssqlPool, isMssqlEnabled, sql } from '../db/mssql';
import { getAccountsTableName, getTransactionsTableName } from '../db/schema';

async function main() {
  if (!isMssqlEnabled()) {
    throw new Error('MSSQL_NOT_CONFIGURED');
  }

  const pool = await getMssqlPool();
  const dbTransaction = new sql.Transaction(pool);
  const accountsTable = getAccountsTableName();
  const transactionsTable = getTransactionsTableName();

  await dbTransaction.begin();

  try {
    const preview = await new sql.Request(dbTransaction).query(`
      SELECT
        (SELECT COUNT(1)
         FROM ${accountsTable}
         WHERE [type] = N'Tiết kiệm vàng'
           AND [assetUnit] = N'gram'
           AND [assetQuantity] IS NOT NULL
           AND [assetQuantity] > 0) AS [accountsToUpdate],
        (SELECT COUNT(1)
         FROM ${transactionsTable} t
         INNER JOIN ${accountsTable} a
           ON a.[tenantId] = t.[tenantId]
          AND a.[id] = t.[accountId]
         WHERE a.[type] = N'Tiết kiệm vàng'
           AND t.[assetUnit] = N'gram'
           AND t.[assetQuantity] IS NOT NULL
           AND t.[assetQuantity] > 0) AS [transactionsToUpdate]
    `);

    const previewRow = (preview.recordset?.[0] as Record<string, unknown> | undefined) ?? {};
    const accountsToUpdate = Number(previewRow.accountsToUpdate ?? 0);
    const transactionsToUpdate = Number(previewRow.transactionsToUpdate ?? 0);

    const transactionsResult = await new sql.Request(dbTransaction).query(`
      UPDATE t
      SET
        t.[assetQuantity] = ROUND(CAST(t.[assetQuantity] AS DECIMAL(18, 6)) / 3.75, 6),
        t.[assetUnit] = N'chi'
      FROM ${transactionsTable} t
      INNER JOIN ${accountsTable} a
        ON a.[tenantId] = t.[tenantId]
       AND a.[id] = t.[accountId]
      WHERE a.[type] = N'Tiết kiệm vàng'
        AND t.[assetUnit] = N'gram'
        AND t.[assetQuantity] IS NOT NULL
        AND t.[assetQuantity] > 0;

      SELECT @@ROWCOUNT AS [affected];
    `);

    const accountsResult = await new sql.Request(dbTransaction).query(`
      UPDATE ${accountsTable}
      SET
        [assetQuantity] = ROUND(CAST([assetQuantity] AS DECIMAL(18, 6)) / 3.75, 6),
        [assetUnit] = N'chi'
      WHERE [type] = N'Tiết kiệm vàng'
        AND [assetUnit] = N'gram'
        AND [assetQuantity] IS NOT NULL
        AND [assetQuantity] > 0;

      SELECT @@ROWCOUNT AS [affected];
    `);

    await dbTransaction.commit();

    const transactionsAffected = Number((transactionsResult.recordset?.[0] as Record<string, unknown> | undefined)?.affected ?? 0);
    const accountsAffected = Number((accountsResult.recordset?.[0] as Record<string, unknown> | undefined)?.affected ?? 0);

    console.log(`Gold unit migration completed. Accounts: ${accountsAffected}/${accountsToUpdate}, Transactions: ${transactionsAffected}/${transactionsToUpdate}.`);
  } catch (error) {
    await dbTransaction.rollback();
    throw error;
  } finally {
    await closeMssqlPool();
  }
}

main().catch((error) => {
  console.error('Gold unit migration failed.');
  console.error(error);
  process.exitCode = 1;
});
