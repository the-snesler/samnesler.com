import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { baseBtnClass, palette } from './styles';

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  startRect: CropRect;
}

interface CropScreenProps {
  file: File;
  parsing: boolean;
  onBack: () => void;
  onSkip: () => void | Promise<void>;
  onConfirmCrop: (file: File) => void | Promise<void>;
}

const MIN_CROP_RATIO = 0.12;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const toPercentPoint = (event: { clientX: number; clientY: number }, element: HTMLElement): { x: number; y: number } => {
  const bounds = element.getBoundingClientRect();
  const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
  const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
  return { x, y };
};

const deriveNextRect = (drag: DragState, point: { x: number; y: number }): CropRect => {
  const dx = point.x - drag.startX;
  const dy = point.y - drag.startY;

  if (drag.mode === 'move') {
    return {
      ...drag.startRect,
      x: clamp(drag.startRect.x + dx, 0, 1 - drag.startRect.width),
      y: clamp(drag.startRect.y + dy, 0, 1 - drag.startRect.height)
    };
  }

  if (drag.mode === 'nw') {
    const nextX = clamp(drag.startRect.x + dx, 0, drag.startRect.x + drag.startRect.width - MIN_CROP_RATIO);
    const nextY = clamp(drag.startRect.y + dy, 0, drag.startRect.y + drag.startRect.height - MIN_CROP_RATIO);
    return {
      x: nextX,
      y: nextY,
      width: drag.startRect.width + (drag.startRect.x - nextX),
      height: drag.startRect.height + (drag.startRect.y - nextY)
    };
  }

  if (drag.mode === 'ne') {
    const nextWidth = clamp(
      drag.startRect.width + dx,
      MIN_CROP_RATIO,
      1 - drag.startRect.x
    );
    const nextY = clamp(drag.startRect.y + dy, 0, drag.startRect.y + drag.startRect.height - MIN_CROP_RATIO);
    return {
      x: drag.startRect.x,
      y: nextY,
      width: nextWidth,
      height: drag.startRect.height + (drag.startRect.y - nextY)
    };
  }

  if (drag.mode === 'sw') {
    const nextX = clamp(drag.startRect.x + dx, 0, drag.startRect.x + drag.startRect.width - MIN_CROP_RATIO);
    const nextHeight = clamp(
      drag.startRect.height + dy,
      MIN_CROP_RATIO,
      1 - drag.startRect.y
    );
    return {
      x: nextX,
      y: drag.startRect.y,
      width: drag.startRect.width + (drag.startRect.x - nextX),
      height: nextHeight
    };
  }

  const nextWidth = clamp(
    drag.startRect.width + dx,
    MIN_CROP_RATIO,
    1 - drag.startRect.x
  );
  const nextHeight = clamp(
    drag.startRect.height + dy,
    MIN_CROP_RATIO,
    1 - drag.startRect.y
  );

  return {
    x: drag.startRect.x,
    y: drag.startRect.y,
    width: nextWidth,
    height: nextHeight
  };
};

const createCroppedFile = async (source: File, image: HTMLImageElement, rect: CropRect): Promise<File> => {
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;

  const sx = Math.round(rect.x * naturalWidth);
  const sy = Math.round(rect.y * naturalHeight);
  const sw = Math.max(1, Math.round(rect.width * naturalWidth));
  const sh = Math.max(1, Math.round(rect.height * naturalHeight));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;

  const context = canvas.getContext('2d');
  if (!context) {
    return source;
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, sw, sh);
  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(resolve, 'image/jpeg', 0.92);
  });

  if (!blob) {
    return source;
  }

  const baseName = source.name.replace(/\.[^/.]+$/, '');
  return new File([blob], `${baseName || 'receipt'}-crop.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now()
  });
};

export default function CropScreen({ file, parsing, onBack, onSkip, onConfirmCrop }: CropScreenProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect>({
    x: 0.08,
    y: 0.15,
    width: 0.84,
    height: 0.7
  });

  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!drag || !stageRef.current) {
      return;
    }

    const stage = stageRef.current;

    const onPointerMove = (event: PointerEvent) => {
      event.preventDefault();
      const point = toPercentPoint(event, stage);
      setCropRect(deriveNextRect(drag, point));
    };

    const onPointerUp = () => {
      setDrag(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [drag]);

  const startDrag = (mode: DragMode) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!stageRef.current || parsing) {
      return;
    }

    const point = toPercentPoint(event, stageRef.current);
    setDrag({
      mode,
      startX: point.x,
      startY: point.y,
      startRect: cropRect
    });
  };

  const onConfirm = async () => {
    if (!imageRef.current || parsing) {
      return;
    }
    const cropped = await createCroppedFile(file, imageRef.current, cropRect);
    await onConfirmCrop(cropped);
  };

  const handleSize = 18;

  return (
    <div className='min-h-screen px-4 pb-8 pt-5'>
      <div className='mb-4 flex items-center justify-between'>
        <button
          onClick={onBack}
          disabled={parsing}
          className={`${baseBtnClass} bg-transparent py-2 text-sm`}
          style={{ color: palette.accent }}
        >
          ← Back
        </button>
        <h2
          className='m-0 text-[22px] font-bold'
          style={{ fontFamily: "'Fraunces', serif" }}
        >
          Crop Receipt
        </h2>
        <div className='w-14' />
      </div>

      <div
        className='mb-4 rounded-[14px] border p-3 text-[13px] leading-normal'
        style={{
          background: palette.card,
          border: `1px solid ${palette.accentSoft}`,
          color: palette.textSoft,
          boxShadow: palette.shadow
        }}
      >
        Include item lines and prices. Try to exclude the restaurant header, footer, and background table.
      </div>

      <div className='mb-4 overflow-hidden rounded-2xl' style={{ background: palette.card, boxShadow: palette.shadowLg }}>
        <div ref={stageRef} className='relative overflow-hidden' style={{ touchAction: 'none' }}>
          <img
            ref={imageRef}
            src={previewUrl}
            alt='Receipt preview'
            className='block w-full select-none'
            onLoad={() => setImageReady(true)}
            draggable={false}
          />

          {imageReady && (
            <div
              onPointerDown={startDrag('move')}
              className='absolute cursor-move border-2'
              style={{
                left: `${cropRect.x * 100}%`,
                top: `${cropRect.y * 100}%`,
                width: `${cropRect.width * 100}%`,
                height: `${cropRect.height * 100}%`,
                borderColor: palette.accent,
                boxShadow: '0 0 0 9999px rgba(44,36,22,0.45)'
              }}
            >
              <div
                className='absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-sm'
                style={{ background: 'rgba(255,255,255,0.85)' }}
              />

              <div
                onPointerDown={event => {
                  event.stopPropagation();
                  startDrag('nw')(event);
                }}
                className='absolute -left-2.5 -top-2.5 cursor-nwse-resize rounded-full border-2 bg-white'
                style={{ width: handleSize, height: handleSize, borderColor: palette.accent }}
              />
              <div
                onPointerDown={event => {
                  event.stopPropagation();
                  startDrag('ne')(event);
                }}
                className='absolute -right-2.5 -top-2.5 cursor-nesw-resize rounded-full border-2 bg-white'
                style={{ width: handleSize, height: handleSize, borderColor: palette.accent }}
              />
              <div
                onPointerDown={event => {
                  event.stopPropagation();
                  startDrag('sw')(event);
                }}
                className='absolute -bottom-2.5 -left-2.5 cursor-nesw-resize rounded-full border-2 bg-white'
                style={{ width: handleSize, height: handleSize, borderColor: palette.accent }}
              />
              <div
                onPointerDown={event => {
                  event.stopPropagation();
                  startDrag('se')(event);
                }}
                className='absolute -bottom-2.5 -right-2.5 cursor-nwse-resize rounded-full border-2 bg-white'
                style={{ width: handleSize, height: handleSize, borderColor: palette.accent }}
              />
            </div>
          )}
        </div>
      </div>

      <div className='grid grid-cols-2 gap-2'>
        <button
          onClick={() => void onSkip()}
          disabled={parsing}
          className={`${baseBtnClass} py-3 text-sm`}
          style={{
            background: palette.tagBg,
            color: palette.text
          }}
        >
          Skip Crop
        </button>
        <button
          onClick={() => void onConfirm()}
          disabled={parsing || !imageReady}
          className={`${baseBtnClass} py-3 text-sm`}
          style={{
            background: parsing ? palette.border : palette.accent,
            color: parsing ? palette.textSoft : '#fff'
          }}
        >
          {parsing ? 'Reading Receipt...' : 'Use Crop'}
        </button>
      </div>
    </div>
  );
}
