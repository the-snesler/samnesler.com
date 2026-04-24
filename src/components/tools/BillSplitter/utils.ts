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

export const validateItemName = (value: string): string | null => {
  const name = value.trim();
  if (!name) {
    return 'Item name is required.';
  }
  if (name.length > 60) {
    return 'Item name must be 60 characters or less.';
  }
  return null;
};

export const validatePersonName = (value: string): string | null => {
  const name = value.trim();
  if (!name) {
    return 'Name is required.';
  }
  if (name.length > 28) {
    return 'Name must be 28 characters or less.';
  }
  return null;
};

export const validateMoneyAmount = (value: number): string | null => {
  if (!Number.isFinite(value)) {
    return 'Enter a valid number.';
  }
  if (value === 0) {
    return 'Amount cannot be $0.';
  }
  if (Math.abs(value) > 10000) {
    return 'Amount is too large.';
  }
  return null;
};

interface BuildInitialStateResult {
  items: BillItem[];
  people: Person[];
  subtotal: number;
  taxMode: TipTaxMode;
  taxValue: number;
}

export const buildInitialStateFromParsedReceipt = (parsed: ParsedReceipt): BuildInitialStateResult => {
  const items: BillItem[] = parsed.items.map(item => {
    const category = item.category === 'entree' ? 'entree' : item.category === 'shared' ? 'shared' : 'other';
    return {
      id: uid(),
      name: item.name,
      price: Number(item.price),
      category,
      assignedTo: []
    };
  });

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
      return;
    }

    if (item.category === 'shared') {
      item.assignedTo = people.map(person => person.id);
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

export const computeSummary = ({ items, people, taxMode, taxValue, tipMode, tipValue }: ComputeSummaryInput): PersonSummary[] => {
  const itemSubtotal = items.reduce((sum, item) => sum + item.price, 0);
  const resolvedTax = taxMode === 'percent' ? (itemSubtotal * taxValue) / 100 : taxValue;
  const taxRate = itemSubtotal > 0 ? resolvedTax / itemSubtotal : 0;
  const resolvedTip = tipMode === 'percent' ? (itemSubtotal * tipValue) / 100 : tipValue;

  const peopleIds = people.map(person => person.id);
  const getEffectiveAssignees = (item: BillItem): string[] => {
    if (item.category === 'shared') {
      return peopleIds;
    }
    return item.assignedTo;
  };

  return people.map(person => {
    const personItems = items.filter(item => getEffectiveAssignees(item).includes(person.id));
    const itemTotal = personItems.reduce((sum, item) => {
      const assigneeCount = getEffectiveAssignees(item).length;
      if (assigneeCount === 0) {
        return sum;
      }
      return sum + item.price / assigneeCount;
    }, 0);
    const tax = itemTotal * taxRate;
    const tip = itemSubtotal > 0 ? (itemTotal / itemSubtotal) * resolvedTip : 0;

    return {
      ...person,
      items: personItems.map(item => ({
        ...item,
        assignedTo: getEffectiveAssignees(item),
        splitPrice: item.price / getEffectiveAssignees(item).length
      })),
      itemTotal,
      tax,
      tip,
      total: itemTotal + tax + tip
    };
  });
};
