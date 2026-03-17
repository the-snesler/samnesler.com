import CopyButton from './CopyButton';
import { baseBtnClass, palette } from './styles';
import type { PersonSummary } from './types';
import { fmt } from './utils';

interface SummaryScreenProps {
  summary: PersonSummary[];
  onBack: () => void;
}

export default function SummaryScreen({ summary, onBack }: SummaryScreenProps) {
  const grandTotal = summary.reduce((sum, person) => sum + person.total, 0);
  const resolvedTax = summary.reduce((sum, person) => sum + person.tax, 0);
  const resolvedTip = summary.reduce((sum, person) => sum + person.tip, 0);

  return (
    <div className='min-h-screen px-4 pb-10 pt-5'>
      <div className='mb-6 flex items-center'>
        <button
          onClick={onBack}
          className={`${baseBtnClass} bg-transparent py-2 text-sm`}
          style={{ color: palette.accent }}
        >
          ← Edit
        </button>
        <h2
          className='m-0 flex-1 pr-10 text-center text-[22px] font-bold'
          style={{
            fontFamily: "'Fraunces', serif"
          }}
        >
          Summary
        </h2>
      </div>

      <div
        className='mb-4 rounded-2xl px-[18px] py-5 text-center'
        style={{
          background: palette.text,
          color: '#fff',
        }}
      >
        <div className='mb-1 text-xs uppercase tracking-[0.06em] opacity-60'>
          Grand Total
        </div>
        <div className='text-4xl font-bold' style={{ fontFamily: "'Fraunces', serif" }}>
          {fmt(grandTotal)}
        </div>
        <div className='mt-1 text-xs opacity-50'>
          includes {fmt(resolvedTax)} tax + {fmt(resolvedTip)} tip
        </div>
      </div>

      {summary.map(person => (
        <div
          key={person.id}
          className='mb-2.5 rounded-[14px] p-4'
          style={{
            background: palette.card,
            boxShadow: palette.shadow
          }}
        >
          <div className='mb-3 flex items-baseline justify-between'>
            <span className='text-base font-bold'>{person.name}</span>
            <span className='text-[22px] font-bold' style={{ fontFamily: "'Fraunces', serif", color: palette.accent }}>
              {fmt(person.total)}
            </span>
          </div>

          {person.items.map(item => (
            <div
              key={item.id}
              className='flex justify-between py-[3px] text-[13px]'
              style={{
                color: palette.textSoft,
              }}
            >
              <span>
                {item.name}
                {item.assignedTo.length > 1 && <span className='text-[11px] opacity-70'> /{item.assignedTo.length}</span>}
              </span>
              <span>{fmt(item.splitPrice)}</span>
            </div>
          ))}

          <div
            className='mt-2 flex flex-col gap-0.5 border-t pt-2'
            style={{
              borderTop: `1px solid ${palette.border}`,
            }}
          >
            <div className='flex justify-between text-xs' style={{ color: palette.textSoft }}>
              <span>Tax</span>
              <span>{fmt(person.tax)}</span>
            </div>
            <div className='flex justify-between text-xs' style={{ color: palette.textSoft }}>
              <span>Tip</span>
              <span>{fmt(person.tip)}</span>
            </div>
          </div>
        </div>
      ))}

      <CopyButton summary={summary} grandTotal={grandTotal} resolvedTax={resolvedTax} resolvedTip={resolvedTip} />
    </div>
  );
}
