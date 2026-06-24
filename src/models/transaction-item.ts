export interface TransactionItem {
  id: string;
  title: string;
  accountId: string;
  categoryId: string;
  amount: number;
  type: 'Income' | 'Expense';
  occurredAt: string;
  status: 'Draft' | 'Pending' | 'Completed';
  note?: string;
  createdBy: string;
}
