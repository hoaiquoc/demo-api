export interface Account {
  id: string;
  name: string;
  type: string;
  initialBalance: number;
  color: string;
  assetCode?: string | null;
  assetQuantity?: number | null;
  assetUnit?: string | null;
}
