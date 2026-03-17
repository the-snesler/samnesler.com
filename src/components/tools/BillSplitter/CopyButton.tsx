import { useState } from 'react';

import { baseBtnClass, palette } from './styles';
import type { PersonSummary } from './types';
import { fmt } from './utils';

interface CopyButtonProps {
  summary: PersonSummary[];
  grandTotal: number;
  resolvedTax: number;
  resolvedTip: number;
}

export default function CopyButton({ summary, grandTotal, resolvedTax, resolvedTip }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const buildText = (): string => {
    const lines = [`Total: ${fmt(grandTotal)} (with ${fmt(resolvedTax)} tax + ${fmt(resolvedTip)} tip)`];
    lines.push('');

    summary.forEach(person => {
      lines.push(`${person.name}: ${fmt(person.total)}`);
      const itemNames = person.items.map(item => (item.assignedTo.length > 1 ? `${item.name} (shared)` : item.name));
      lines.push(itemNames.join(' + '));
      lines.push('');
    });

    return lines.join('\n').trim();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`${baseBtnClass} mt-2 w-full py-4 text-[15px]`}
      style={{
        background: copied ? palette.green : palette.text,
        color: '#fff',
        boxShadow: copied ? '0 4px 20px rgba(58,125,83,0.3)' : palette.shadowLg
      }}
    >
      {copied ? 'Copied!' : 'Copy Summary'}
    </button>
  );
}
