export interface TransferRequest {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  occurredAt?: string;
  note?: string;
  createdBy: string;
}

