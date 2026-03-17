import type { BillItem, ParsedReceipt, Person, PersonSummary, TipTaxMode } from './types';

export const fmt = (value: number): string => {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `$${safeValue.toFixed(2)}`;
};

export const uid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 9);
};

export const parseInputNumber = (value: string, fallback = 0): number => {
  if (!value.trim()) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

interface BuildInitialStateResult {
  items: BillItem[];
  people: Person[];
  subtotal: number;
  taxMode: TipTaxMode;
  taxValue: number;
}

export const buildInitialStateFromParsedReceipt = (parsed: ParsedReceipt): BuildInitialStateResult => {
  const items: BillItem[] = parsed.items.map(item => ({
    id: uid(),
    name: item.name,
    price: Number(item.price),
    category: item.category === 'entree' ? 'entree' : 'other',
    assignedTo: []
  }));

  const entreeCount = items.filter(item => item.category === 'entree').length;
  const numberOfPeople = Math.max(entreeCount, 2);
  const people: Person[] = Array.from({ length: numberOfPeople }, (_, index) => ({
    id: uid(),
    name: `Person ${index + 1}`
  }));

  let personIndex = 0;
  items.forEach(item => {
    if (item.category === 'entree' && personIndex < people.length) {
      item.assignedTo = [people[personIndex].id];
      personIndex += 1;
    }
  });

  const fallbackSubtotal = items.reduce((sum, item) => sum + item.price, 0);
  const subtotal = typeof parsed.subtotal === 'number' ? parsed.subtotal : fallbackSubtotal;

  if (typeof parsed.tax === 'number' && parsed.tax > 0) {
    return {
      items,
      people,
      subtotal,
      taxMode: 'flat',
      taxValue: parsed.tax
    };
  }

  return {
    items,
    people,
    subtotal,
    taxMode: 'percent',
    taxValue: 5.5
  };
};

interface ComputeSummaryInput {
  items: BillItem[];
  people: Person[];
  taxMode: TipTaxMode;
  taxValue: number;
  tipMode: TipTaxMode;
  tipValue: number;
}

export const computeSummary = ({
  items,
  people,
  taxMode,
  taxValue,
  tipMode,
  tipValue
}: ComputeSummaryInput): PersonSummary[] => {
  const itemSubtotal = items.reduce((sum, item) => sum + item.price, 0);
  const resolvedTax = taxMode === 'percent' ? (itemSubtotal * taxValue) / 100 : taxValue;
  const taxRate = itemSubtotal > 0 ? resolvedTax / itemSubtotal : 0;
  const resolvedTip = tipMode === 'percent' ? (itemSubtotal * tipValue) / 100 : tipValue;

  return people.map(person => {
    const personItems = items.filter(item => item.assignedTo.includes(person.id));
    const itemTotal = personItems.reduce((sum, item) => sum + item.price / item.assignedTo.length, 0);
    const tax = itemTotal * taxRate;
    const tip = itemSubtotal > 0 ? (itemTotal / itemSubtotal) * resolvedTip : 0;

    return {
      ...person,
      items: personItems.map(item => ({
        ...item,
        splitPrice: item.price / item.assignedTo.length
      })),
      itemTotal,
      tax,
      tip,
      total: itemTotal + tax + tip
    };
  });
};
