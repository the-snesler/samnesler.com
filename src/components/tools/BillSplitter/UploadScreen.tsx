import { useRef, useState } from 'react';

import { baseBtnClass, palette } from './styles';

interface UploadScreenProps {
  onImage: (file: File) => void | Promise<void>;
  parsing: boolean;
  error: string | null;
}

export default function UploadScreen({ onImage, parsing, error }: UploadScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className='flex min-h-screen flex-col px-5 pb-6 pt-6'>
      <div className='mb-8 pt-5 text-center'>
        <div className='mb-2 text-[40px]'>🍜</div>
        <h1
          className='mb-1 text-[30px] font-bold tracking-[-0.02em]'
          style={{
            fontFamily: "'Fraunces', serif"
          }}
        >
          Split the Bill
        </h1>
        <p className='m-0 text-[15px] leading-[1.5]' style={{ color: palette.textSoft }}>
          Scan a receipt. Assign items. Done.
        </p>
      </div>

      <div
        onDragOver={event => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={event => {
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer?.files?.[0];
          if (file && file.type.startsWith('image/')) {
            void onImage(file);
          }
        }}
        onClick={() => !parsing && inputRef.current?.click()}
        className={`relative flex min-h-[340px] flex-1 flex-col items-center justify-center overflow-hidden rounded-[20px] border-2 border-dashed transition-all duration-200 ${parsing ? 'cursor-wait' : 'cursor-pointer'}`}
        style={{
          border: `2px dashed ${dragOver ? palette.accent : palette.border}`,
          background: dragOver ? palette.accentSoft : palette.card,
          boxShadow: dragOver ? palette.shadowLg : 'none'
        }}
      >
        {!parsing && (
          <div className='pointer-events-none absolute inset-0 opacity-[0.04]'>
            {Array.from({ length: 12 }).map((_, index) => (
              <div
                key={index}
                style={{
                  height: 1,
                  background: palette.text,
                  margin: `${20 + index * 28}px 40px`,
                  width: `${50 + Math.sin(index) * 20}%`
                }}
              />
            ))}
          </div>
        )}

        {parsing ? (
          <div className='text-center'>
            <div
              className='mx-auto mb-4 h-12 w-12 animate-[spin_0.8s_linear_infinite] rounded-full border-[3px]'
              style={{
                border: `3px solid ${palette.border}`,
                borderTopColor: palette.accent,
              }}
            />
            <p className='mb-1 text-base font-medium' style={{ color: palette.text }}>
              Reading your receipt...
            </p>
            <p className='m-0 text-[13px]' style={{ color: palette.textSoft }}>
              This takes a few seconds
            </p>
          </div>
        ) : (
          <div className='p-5 text-center'>
            <div
              className='mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-[20px] text-[32px]'
              style={{
                background: palette.accentSoft,
              }}
            >
              📷
            </div>
            <p className='mb-1.5 text-[17px] font-semibold'>Upload a receipt photo</p>
            <p className='mb-5 text-sm leading-[1.5]' style={{ color: palette.textSoft }}>
              Tap here or drag and drop an image
            </p>
            <div
              className={`${baseBtnClass} inline-block px-7 py-3 text-[15px]`}
              style={{
                background: palette.accent,
                color: '#fff',
              }}
            >
              Choose Photo
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type='file'
          accept='image/*'
          onChange={event => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              void onImage(file);
            }
          }}
          className='hidden'
        />
      </div>

      {error && (
        <div
          className='mt-4 rounded-xl px-4 py-3 text-center text-sm'
          style={{
            background: '#FEF0EE',
            color: '#C0392B',
          }}
        >
          {error}
        </div>
      )}

      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}
