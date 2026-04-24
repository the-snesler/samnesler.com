export type TipTaxMode = 'percent' | 'flat';
export type ItemCategory = 'entree' | 'other' | 'shared';

export interface BillItem {
  id: string;
  name: string;
  price: number;
  category: ItemCategory;
  assignedTo: string[];
}

export interface Person {
  id: string;
  name: string;
}

export interface SummaryItem extends BillItem {
  splitPrice: number;
}

export interface PersonSummary extends Person {
  items: SummaryItem[];
  itemTotal: number;
  tax: number;
  tip: number;
  total: number;
}

export interface ParsedReceiptItem {
  name: string;
  price: number;
  category: ItemCategory;
}

export interface ParsedReceipt {
  items: ParsedReceiptItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
}
