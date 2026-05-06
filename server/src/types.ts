export type ReceiptLineItem = {
  name: string;
  amount: number;
};

export type ReceiptData = {
  merchant: string;
  date: string;
  lineItems: ReceiptLineItem[];
  total: number;
};

export type SavedReceipt = {
  id: string;
  createdAt: string;
  updatedAt: string;
  data: ReceiptData;
};
