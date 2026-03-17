import type { Dispatch, SetStateAction } from 'react';

import { baseBtnClass, palette } from './styles';
import type { BillItem, Person, TipTaxMode } from './types';
import { fmt, parseInputNumber, uid } from './utils';

interface AssignScreenProps {
  items: BillItem[];
  setItems: Dispatch<SetStateAction<BillItem[]>>;
  people: Person[];
  setPeople: Dispatch<SetStateAction<Person[]>>;
  tipMode: TipTaxMode;
  setTipMode: Dispatch<SetStateAction<TipTaxMode>>;
  tipValue: number;
  setTipValue: Dispatch<SetStateAction<number>>;
  taxMode: TipTaxMode;
  setTaxMode: Dispatch<SetStateAction<TipTaxMode>>;
  taxValue: number;
  setTaxValue: Dispatch<SetStateAction<number>>;
  assignModal: string | null;
  setAssignModal: Dispatch<SetStateAction<string | null>>;
  onDone: () => void;
  onBack: () => void;
}

export default function AssignScreen({
  items,
  setItems,
  people,
  setPeople,
  tipMode,
  setTipMode,
  tipValue,
  setTipValue,
  taxMode,
  setTaxMode,
  taxValue,
  setTaxValue,
  assignModal,
  setAssignModal,
  onDone,
  onBack
}: AssignScreenProps) {
  const floatingItems = items.filter(item => item.assignedTo.length === 0);
  const allAssigned = floatingItems.length === 0;

  const itemSubtotal = items.reduce((sum, item) => sum + item.price, 0);
  const resolvedTip = tipMode === 'percent' ? (itemSubtotal * tipValue) / 100 : tipValue;
  const resolvedTax = taxMode === 'percent' ? (itemSubtotal * taxValue) / 100 : taxValue;

  const toggleAssign = (itemId: string, personId: string) => {
    setItems(previous =>
      previous.map(item => {
        if (item.id !== itemId) {
          return item;
        }

        const isAssigned = item.assignedTo.includes(personId);
        return {
          ...item,
          assignedTo: isAssigned
            ? item.assignedTo.filter(id => id !== personId)
            : [...item.assignedTo, personId]
        };
      })
    );
  };

  const addPerson = () => {
    setPeople(previous => [...previous, { id: uid(), name: `Person ${previous.length + 1}` }]);
  };

  const removePerson = (personId: string) => {
    setItems(previous =>
      previous.map(item => ({
        ...item,
        assignedTo: item.assignedTo.filter(id => id !== personId)
      }))
    );
    setPeople(previous => previous.filter(person => person.id !== personId));
  };

  const getPersonItems = (personId: string) => items.filter(item => item.assignedTo.includes(personId));

  const getPersonSubtotal = (personId: string): number =>
    getPersonItems(personId).reduce((sum, item) => sum + item.price / item.assignedTo.length, 0);

  const modalItem = assignModal ? items.find(item => item.id === assignModal) ?? null : null;

  return (
    <div className='min-h-screen px-4 pb-[120px] pt-5'>
      <div className='mb-5 flex items-center'>
        <button
          onClick={onBack}
          className={`${baseBtnClass} bg-transparent py-2 text-sm`}
          style={{
            color: palette.accent,
          }}
        >
          ← Rescan
        </button>
        <h2
          className='m-0 flex-1 pr-[60px] text-center text-[22px] font-bold'
          style={{
            fontFamily: "'Fraunces', serif"
          }}
        >
          Assign Items
        </h2>
      </div>

      <div
        className='mb-4 grid grid-cols-2 gap-2.5'
        style={{
        }}
      >
        <div
          className='rounded-[14px] px-3.5 py-3'
          style={{
            background: palette.card,
            boxShadow: palette.shadow
          }}
        >
          <div className='mb-2 flex items-center justify-between'>
            <div className='text-[11px] font-semibold uppercase tracking-[0.05em]' style={{ color: palette.textSoft }}>
              Tip
            </div>
            {tipMode === 'percent' && itemSubtotal > 0 && (
              <div className='text-[13px] font-bold' style={{ color: palette.accent }}>
                {fmt(resolvedTip)}
              </div>
            )}
          </div>
          <div className='mb-2 flex gap-1.5'>
            {(['percent', 'flat'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => {
                  setTipMode(mode);
                  setTipValue(mode === 'percent' ? 20 : 0);
                }}
                className={`${baseBtnClass} flex-1 py-1.5 text-xs`}
                style={{
                  background: tipMode === mode ? palette.accent : palette.tagBg,
                  color: tipMode === mode ? '#fff' : palette.text
                }}
              >
                {mode === 'percent' ? '%' : '$'}
              </button>
            ))}
          </div>
          {tipMode === 'percent' ? (
            <div className='flex gap-1'>
              {[15, 18, 20, 25].map(percent => (
                <button
                  key={percent}
                  onClick={() => setTipValue(percent)}
                  className={`${baseBtnClass} flex-1 py-[7px] text-[13px]`}
                  style={{
                    background: tipValue === percent ? palette.text : palette.tagBg,
                    color: tipValue === percent ? '#fff' : palette.text
                  }}
                >
                  {percent}%
                </button>
              ))}
            </div>
          ) : (
            <input
              type="number"
              value={tipValue}
              onChange={event => setTipValue(parseInputNumber(event.currentTarget.value, 0))}
              placeholder="0.00"
              className='box-border w-full rounded-lg border px-2.5 py-2 text-[15px] outline-none'
              style={{
                border: `1px solid ${palette.border}`,
                fontFamily: "'DM Sans', sans-serif"
              }}
            />
          )}
        </div>

        <div
          className='rounded-[14px] px-3.5 py-3'
          style={{
            background: palette.card,
            boxShadow: palette.shadow
          }}
        >
          <div className='mb-2 flex items-center justify-between'>
            <div className='text-[11px] font-semibold uppercase tracking-[0.05em]' style={{ color: palette.textSoft }}>
              Tax
            </div>
            {taxMode === 'percent' && itemSubtotal > 0 && (
              <div className='text-[13px] font-bold' style={{ color: palette.textSoft }}>
                {fmt(resolvedTax)}
              </div>
            )}
          </div>
          <div className='mb-2 flex gap-1.5'>
            {(['percent', 'flat'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => {
                  setTaxMode(mode);
                  setTaxValue(mode === 'percent' ? 5.5 : 0);
                }}
                className={`${baseBtnClass} flex-1 py-1.5 text-xs`}
                style={{
                  background: taxMode === mode ? palette.accent : palette.tagBg,
                  color: taxMode === mode ? '#fff' : palette.text
                }}
              >
                {mode === 'percent' ? '%' : '$'}
              </button>
            ))}
          </div>
          {taxMode === 'percent' ? (
            <div className='flex gap-1'>
              {[5.5, 6, 7, 8].map(percent => (
                <button
                  key={percent}
                  onClick={() => setTaxValue(percent)}
                  className={`${baseBtnClass} flex-1 py-[7px] text-xs`}
                  style={{
                    background: taxValue === percent ? palette.text : palette.tagBg,
                    color: taxValue === percent ? '#fff' : palette.text
                  }}
                >
                  {percent}%
                </button>
              ))}
            </div>
          ) : (
            <input
              type="number"
              value={taxValue}
              onChange={event => setTaxValue(parseInputNumber(event.currentTarget.value, 0))}
              placeholder="0.00"
              className='box-border w-full rounded-lg border px-2.5 py-2 text-[15px] outline-none'
              style={{
                border: `1px solid ${palette.border}`,
                fontFamily: "'DM Sans', sans-serif"
              }}
            />
          )}
        </div>
      </div>

      {floatingItems.length > 0 && (
        <div
          className='mb-4 rounded-[14px] border p-3.5'
          style={{
            background: palette.card,
            boxShadow: palette.shadow,
            border: `1px solid ${palette.accentSoft}`
          }}
        >
          <div
            className='mb-2.5 text-xs font-semibold uppercase tracking-[0.05em]'
            style={{
              color: palette.accent,
            }}
          >
            Unassigned Items - tap to assign
          </div>
          <div className='flex flex-wrap gap-1.5'>
            {floatingItems.map(item => (
              <button
                key={item.id}
                onClick={() => setAssignModal(item.id)}
                className={`${baseBtnClass} flex items-center gap-1.5 px-3 py-2 text-[13px]`}
                style={{
                  background: palette.accentSoft,
                  color: palette.accent,
                }}
              >
                <span>{item.name}</span>
                <span style={{ fontWeight: 700 }}>{fmt(item.price)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {allAssigned && (
        <div
          className='mb-4 rounded-[14px] px-3.5 py-2.5 text-center text-[13px] font-medium'
          style={{
            background: palette.greenSoft,
            color: palette.green,
          }}
        >
          All items assigned
        </div>
      )}

      {people.map(person => {
        const personItems = getPersonItems(person.id);
        const personSubtotal = getPersonSubtotal(person.id);

        return (
          <div
            key={person.id}
            className='mb-2.5 rounded-[14px] p-3.5'
            style={{
              background: palette.card,
              boxShadow: palette.shadow
            }}
          >
            <div
              className='flex items-center justify-between'
              style={{
                marginBottom: personItems.length > 0 ? 10 : 0
              }}
            >
              <div className='flex items-center gap-2.5'>
                <div
                  className='flex h-8 w-8 items-center justify-center rounded-[10px] text-sm font-bold'
                  style={{
                    background: palette.accentSoft,
                    color: palette.accent
                  }}
                >
                  {person.name.replace('Person ', 'P')}
                </div>
                <span className='text-[15px] font-semibold'>{person.name}</span>
                {personSubtotal > 0 && (
                  <span className='text-sm font-bold' style={{ color: palette.accent }}>
                    {fmt(personSubtotal)}
                  </span>
                )}
              </div>
              {people.length > 1 && (
                <button
                  onClick={() => removePerson(person.id)}
                  className={`${baseBtnClass} bg-transparent p-1 text-[18px] leading-none`}
                  style={{ color: palette.textSoft }}
                >
                  ×
                </button>
              )}
            </div>
            {personItems.length > 0 && (
              <div className='flex flex-wrap gap-1.5'>
                {personItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setAssignModal(item.id)}
                    className={`${baseBtnClass} flex items-center gap-[5px] px-2.5 py-1.5 text-xs`}
                    style={{
                      background: palette.tagBg,
                      color: palette.text,
                    }}
                  >
                    <span>{item.name}</span>
                    <span className='font-medium' style={{ color: palette.textSoft }}>
                      {item.assignedTo.length > 1 ? `${fmt(item.price / item.assignedTo.length)} ea` : fmt(item.price)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {personItems.length === 0 && (
              <div className='mt-1 text-[13px]' style={{ color: palette.textSoft }}>
                No items yet
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={addPerson}
        className={`${baseBtnClass} mb-4 mt-1 w-full border-2 border-dashed bg-transparent py-3.5 text-sm`}
        style={{
          border: `2px dashed ${palette.border}`,
          color: palette.textSoft,
        }}
      >
        + Add Person
      </button>

      <div
        className='fixed bottom-0 left-0 right-0 z-10 flex justify-center px-5 py-3.5'
        style={{
          background: 'linear-gradient(transparent, rgba(250,247,242,1) 20%)',
        }}
      >
        <button
          onClick={onDone}
          disabled={!allAssigned}
          className={`${baseBtnClass} w-full max-w-[440px] py-4 text-base`}
          style={{
            background: allAssigned ? palette.accent : palette.border,
            color: allAssigned ? '#fff' : palette.textSoft,
            boxShadow: allAssigned ? '0 4px 20px rgba(212,88,42,0.3)' : 'none'
          }}
        >
          {allAssigned ? 'See Summary' : `Assign ${floatingItems.length} item${floatingItems.length !== 1 ? 's' : ''} to continue`}
        </button>
      </div>

      {modalItem && (
        <div
          onClick={() => setAssignModal(null)}
          className='fixed inset-0 z-100 flex items-end justify-center backdrop-blur-[2px]'
          style={{
            background: 'rgba(44,36,22,0.4)',
          }}
        >
          <div
            onClick={event => event.stopPropagation()}
            className='w-full max-w-[480px] rounded-t-[20px] px-5 pb-8 pt-6'
            style={{
              background: palette.card,
              boxShadow: palette.shadowLg
            }}
          >
            <div className='mx-auto mb-4 h-1 w-9 rounded-sm' style={{ background: palette.border }} />
            <h3 className='mb-1 text-lg font-bold' style={{ fontFamily: "'Fraunces', serif" }}>
              {modalItem.name}
            </h3>
            <p className='mb-[18px] text-[15px]' style={{ color: palette.textSoft }}>
              {fmt(modalItem.price)} - who is sharing this?
            </p>
            <div className='flex flex-col gap-2'>
              {people.map(person => {
                const isSelected = modalItem.assignedTo.includes(person.id);
                const otherItems = items.filter(item => item.id !== modalItem.id && item.assignedTo.includes(person.id));

                return (
                  <button
                    key={person.id}
                    onClick={() => toggleAssign(modalItem.id, person.id)}
                    className={`${baseBtnClass} flex items-start justify-between px-4 py-3.5 text-left text-[15px]`}
                    style={{
                      background: isSelected ? palette.accent : palette.tagBg,
                      color: isSelected ? '#fff' : palette.text,
                    }}
                  >
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-center justify-between'>
                        <span className='font-semibold'>{person.name}</span>
                        {isSelected && (
                          <span className='ml-2 shrink-0 text-[13px] opacity-80'>
                            {modalItem.assignedTo.length > 1 ? fmt(modalItem.price / modalItem.assignedTo.length) : 'selected'}
                          </span>
                        )}
                      </div>
                      {otherItems.length > 0 && (
                        <div
                          className='mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-normal leading-[1.4]'
                          style={{
                            opacity: isSelected ? 0.7 : 0.55,
                          }}
                        >
                          {otherItems.map(item => item.name).join(', ')}
                        </div>
                      )}
                      {otherItems.length === 0 && (
                        <div
                          className='mt-1 text-xs font-normal italic'
                          style={{
                            opacity: isSelected ? 0.5 : 0.35,
                          }}
                        >
                          No other items
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setAssignModal(null)}
              className={`${baseBtnClass} mt-4 w-full py-3.5 text-[15px]`}
              style={{
                background: palette.text,
                color: '#fff',
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
