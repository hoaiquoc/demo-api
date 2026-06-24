export interface TransactionItem {
  id: string;
  title: string;
  amount: number;
  type: 'Income' | 'Expense';
  transactionDate: string;
  note?: string;
}
