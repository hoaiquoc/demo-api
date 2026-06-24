export interface TransactionItem {
  id: string;
  title: string;
  accountId: string;
  categoryId: string;
  amount: number;
  type: 'Income' | 'Expense';
  occurredAt: string;
  note?: string;
  createdBy: string;
}
