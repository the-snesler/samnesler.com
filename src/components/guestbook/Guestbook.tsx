import { Check, CircleX, LoaderCircle, RefreshCw, Send, Trash2 } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';

import colors from '@/assets/dnot-froget.hex?raw';
import { drawingReducer } from '@/components/guestbook/drawingReducer';

export default function Guestbook() {
  const colorList = colors
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => `#${line}`);

  // Constants
  const GRID_SIZE = 8;
  const CELL_SIZE = 300 / GRID_SIZE; // Canvas is 300x300
  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Drawing state
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [grid, setGrid] = useState<number[]>([]);
  const [drawingState, dispatch] = useReducer(drawingReducer, { state: 'closed', error: false });
  const [drawings, setDrawings] = useState<{ id: string; data: Uint8Array }[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  // Guestbook images state
  const [drawingImages, setDrawingImages] = useState<{ id: string; image: string }[]>([]);
  const [guestbookKey, setGuestbookKey] = useState<string | null>(null);
  const [blockIPOnDelete, setBlockIPOnDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Computed states
  const state = drawingState.state;
  const didSubmissionError = drawingState.error;
  const isSubmitting = state === 'submitting';
  const isCanvasVisible = state !== 'closed' && state !== 'complete';
  const isClosing = state === 'closing' || state === 'closingSuccess';

  // Initialize the grid with a random color
  const initializeGrid = () => {
    const randomColorIndex = Math.floor(Math.random() * colorList.length);
    const newGrid: number[] = Array(GRID_SIZE * GRID_SIZE).fill(randomColorIndex);
    setGrid(newGrid);
    return newGrid;
  };

  // Draw the grid on both main and preview canvases
  const drawGrid = (gridData: number[]) => {
    const canvas = canvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const previewCtx = previewCanvas?.getContext('2d');
    if (!ctx) return;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const index = y * GRID_SIZE + x;
        const colorIndex = gridData[index];
        const fillColor = colorList[colorIndex];
        // Draw on main canvas
        ctx.fillStyle = fillColor;
        ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE + 1, CELL_SIZE + 1); // +1 to avoid gaps
        // Draw on preview canvas if available
        if (previewCtx) {
          previewCtx.fillStyle = fillColor;
          previewCtx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE + 1, CELL_SIZE + 1);
        }
      }
    }
  };

  // Get grid coordinates from mouse/touch position
  const getCellFromPosition = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const canvasX = (x - rect.left) * scaleX;
    const canvasY = (y - rect.top) * scaleY;

    const cellX = Math.floor(canvasX / CELL_SIZE);
    const cellY = Math.floor(canvasY / CELL_SIZE);

    // Ensure coordinates are within canvas bounds
    if (cellX >= 0 && cellX < GRID_SIZE && cellY >= 0 && cellY < GRID_SIZE) {
      return { x: cellX, y: cellY };
    }

    return null;
  };

  // Handle mouse/touch drawing events
  const handleDrawStart = (e: MouseEvent | TouchEvent) => {
    setIsDrawing(true);
    // Get position from event
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const cell = getCellFromPosition(clientX, clientY);
    if (cell) {
      const index = cell.y * GRID_SIZE + cell.x;
      const newGrid = [...grid];
      newGrid[index] = selectedColorIndex;
      setGrid(newGrid);
      drawGrid(newGrid);
    }
  };

  const handleDrawMove = (e: MouseEvent | TouchEvent) => {
    if (!isDrawing) return;
    // Prevent scrolling on touch devices
    if ('touches' in e) e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const cell = getCellFromPosition(clientX, clientY);
    if (cell) {
      const index = cell.y * GRID_SIZE + cell.x;
      // Only update if the color is different
      if (grid[index] !== selectedColorIndex) {
        const newGrid = [...grid];
        newGrid[index] = selectedColorIndex;
        setGrid(newGrid);
        drawGrid(newGrid);
      }
    }
  };

  // Clear the canvas to a random color
  const [clearAngle, setClearAngle] = useState(0);
  const handleClear = () => {
    setClearAngle(prev => prev + 180);
    initializeGrid();
  };

  // Submit the drawing
  const handleSubmit = async () => {
    dispatch('SUBMIT');
    try {
      // Convert grid to Uint8Array
      const drawingData = new Uint8Array(grid);
      // Send to backend
      const response = await fetch('/api/guestbook', {
        method: 'POST',
        body: drawingData,
        headers: {
          'Content-Type': 'application/octet-stream'
        }
      });
      if (response.ok) {
        dispatch('SUBMIT_SUCCESS');
      } else {
        dispatch('SUBMIT_ERROR');
        console.error('Error submitting drawing:', response.statusText);
      }
    } catch (error) {
      dispatch('SUBMIT_ERROR');
      console.error('Error submitting drawing:', error);
    }
  };

  // Handle animation end
  const handleAnimationEnd = (e: AnimationEvent) => {
    if (e.target === e.currentTarget) {
      dispatch('ANIMATION_COMPLETE');
    }
  };

  // Handle state change side effects
  // Clear the canvas & scroll to it when it becomes visible
  useEffect(() => {
    if (isCanvasVisible) {
      handleClear();
      setTimeout(() => {
        canvasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [isCanvasVisible]);

  useEffect(() => {
    // Update preview when it becomes visible
    if (state === 'drawing' && previewCanvasRef.current) {
      drawGrid(grid);
    }
  }, [state]);

  // Update canvas when grid changes
  useEffect(() => {
    drawGrid(grid);
  }, [grid]);

  // fetch drawings from the server
  const fetchDrawings = async () => {
    fetch('/api/guestbook')
      .then(res => res.arrayBuffer())
      .then(buf => {
        const data = new Uint8Array(buf);
        const drawings: Array<{ id: string; data: Uint8Array }> = [];
        let startIndex = 0;
        for (let i = 0; i < data.length; i++) {
          if (data[i] === 255) {
            // Found a delimiter, extract the drawing
            const drawing = data.slice(startIndex, i);
            drawings.push({ id: `drawing-${startIndex}`, data: drawing });
            startIndex = i + 1;
          }
        }
        // Include last drawing
        if (startIndex < data.length) {
          drawings.push({ id: `drawing-${startIndex}`, data: data.slice(startIndex, data.length) });
        }

        setDrawings(drawings.reverse());
      })
      .catch(err => {
        console.error('Error fetching drawings:', err);
      });
  };

  // Fetch drawings on component mount
  useEffect(() => {
    fetchDrawings();
    // Check for guestbookKey in URL
    const urlParams = new URLSearchParams(window.location.search);
    const key = urlParams.get('guestbookKey');
    if (key) {
      setGuestbookKey(key);
    }
  }, []);

  // Convert a drawing's data to an image URL
  const drawingToImageUrl = (drawingData: Uint8Array): string => {
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
      offscreenCanvasRef.current.width = 8;
      offscreenCanvasRef.current.height = 8;
    }
    const canvas = offscreenCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    // Draw the grid to the offscreen canvas
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const index = y * 8 + x;
        const colorIndex = drawingData[index];
        ctx.fillStyle = colorList[colorIndex];
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Convert canvas to image URL
    return canvas.toDataURL('image/png');
  };

  // Convert all drawings to image URLs
  useEffect(() => {
    const images = drawings.map(drawing => ({ id: drawing.id, image: drawingToImageUrl(drawing.data) }));
    setDrawingImages(images);
  }, [drawings]);

  const handleDeleteDrawing = async (index: number) => {
    const originalIndex = drawings.length - 1 - index; // Adjust index for reverse order
    if (!guestbookKey) {
      console.error('Guestbook key not found.');
      return;
    }

    try {
      const response = await fetch('/api/guestbook', {
        method: 'DELETE',
        headers: {
          'secret-key': guestbookKey,
          'drawing-index': originalIndex.toString(),
          'block-ip': blockIPOnDelete.toString()
        }
      });

      if (response.ok) {
        const responseText = await response.text();
        setMessage(`Delete: ${responseText}`);
        fetchDrawings();
      } else {
        console.error('Error deleting drawing:', await response.text());
      }
    } catch (error) {
      console.error('Error deleting drawing:', error);
    }
  };

  const submitButtonTranslateY = state === 'submitting' ? '-2rem' : didSubmissionError || state === 'closingSuccess' ? '-4rem' : '0';
  const startingCol = 7 - (drawings.length % 8) + 1;
  const mobileStartingCol = 3 - (drawings.length % 4) + 1;

  return (
    <div className="mx-auto my-2 max-w-[1024px]">
      <div
        className={`animate-in fade-in fade-out animation-fill-forward mx-auto w-max overflow-hidden transition-[max-height,margin] duration-700 ${state === 'closingSuccess' && 'delay-300'} ${isClosing || !isCanvasVisible ? 'animate-out my-0 max-h-0' : 'my-14 max-h-[400px]'}`}
        onAnimationEnd={handleAnimationEnd}
        onMouseLeave={() => {
          setIsDrawing(false);
        }}
        onTouchCancel={() => {
          setIsDrawing(false);
        }}
        onMouseUp={() => {
          setIsDrawing(false);
        }}
      >
        <div className={`fill-mode-forwards fade-out flex w-max gap-4`}>
          <canvas
            id="canvas"
            ref={canvasRef}
            width="300"
            height="300"
            className="border-content cursor-crosshair rounded-md border-2"
            onMouseDown={handleDrawStart}
            onMouseMove={handleDrawMove}
            onTouchStart={handleDrawStart}
            onTouchMove={handleDrawMove}
          ></canvas>

          <div className="flex flex-col justify-center gap-2">
            <button
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
              onClick={handleClear}
              disabled={isSubmitting}
            >
              <RefreshCw size={16} className="transition-transform duration-300" style={{ rotate: `${clearAngle}deg` }} />
            </button>
            {colorList.map((color, index) => (
              <button
                key={color}
                className={`h-8 w-8 cursor-pointer rounded-full border-2 ${selectedColorIndex === index ? 'border-black dark:border-white' : 'border-transparent'}`}
                style={{ backgroundColor: color }}
                onClick={() => setSelectedColorIndex(index)}
                aria-label={`Select color ${index + 1}`}
              />
            ))}
          </div>
        </div>
        <button
          className="group relative col-start-[var(--mobile-col-start)] mx-auto mt-4 block h-8 sm:col-start-[var(--col-start)]"
          style={{ '--col-start': startingCol.toString(), '--mobile-col-start': mobileStartingCol.toString() }}
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          <div className="bg-accent absolute inset-0 h-8 w-full rounded-full" />
          <div
            className={`bg-accent relative h-8 w-max cursor-pointer items-center overflow-clip rounded-full text-white transition-transform active:translate-y-0 disabled:bg-violet-300 ${state === 'drawing' && 'hover:-translate-y-1.5 hover:bg-violet-600'}`}
          >
            <div
              className="grid place-items-center gap-2 px-4 py-1 transition-transform"
              style={{ transform: `translateY(${submitButtonTranslateY})` }}
            >
              <div className="flex items-center gap-2">
                <Send size={16} />
                Submit
              </div>
              <div className="flex items-center gap-2">
                <LoaderCircle size={16} className="animate-spin" />
                Loading
              </div>
              <div className="flex items-center gap-2">
                {state === 'closingSuccess' ? (
                  <>
                    <Check size={16} />
                    Success!
                  </>
                ) : (
                  <>
                    <CircleX size={16} />
                    Error
                  </>
                )}
              </div>
            </div>
          </div>
        </button>
      </div>
      {guestbookKey && (
        <div className="mx-auto mt-4 flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={blockIPOnDelete}
              onChange={(e: Event) => setBlockIPOnDelete((e.target as HTMLInputElement).checked)}
              className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Block IP when deleting drawings</span>
          </label>
        </div>
      )}
      {message && <p>{message}</p>}
      <div className="grid grid-cols-4 items-stretch gap-2 px-1 sm:grid-cols-8 md:px-8">
        <div
          className="relative col-start-[var(--mobile-col-start)] sm:col-start-[var(--col-start)]"
          style={{ '--col-start': startingCol.toString(), '--mobile-col-start': mobileStartingCol.toString() }}
        >
          {state === 'complete' && <div className="aspect-square w-full rounded-sm shadow-sm" />}
          {state !== 'closed' && (
            <canvas
              className={`fade-out animation-fill-forward absolute inset-0 aspect-square w-full rounded-sm transition duration-500 ${state !== 'closingSuccess' && state !== 'complete' ? 'blur-xs' : ''} ${state === 'closing' ? 'animate-out' : ''}`}
              width={300}
              height={300}
              ref={previewCanvasRef}
            />
          )}
          {state !== 'complete' && (
            <div
              id="new-drawing"
              className={`bg-bkg fade-out fill-mode-forwards flex aspect-square h-full w-full cursor-pointer items-center justify-center rounded-sm shadow-sm transition-opacity duration-500 hover:bg-gray-100 dark:hover:bg-gray-800 ${state === 'closingSuccess' ? 'animate-out' : ''}`}
              style={{
                opacity: state !== 'closed' ? 0.6 : 1
              }}
              onClick={() => dispatch('TOGGLE_CANVAS')}
            >
              <span className="text-2xl font-bold">+</span>
            </div>
          )}
        </div>
        {drawingImages.map(({ id, image }, index) => (
          <div className="bg-bkg animate-in fade-in relative aspect-square rounded-sm" style={{ animationDelay: `${index * 50}ms` }} key={id}>
            <img src={image} className="absolute inset-0 -z-10 w-full rounded-sm object-cover blur-xs" />
            <img src={image} alt={`Drawing ${id}`} className="pixelated h-full w-full rounded-sm object-cover" />
            {guestbookKey && state !== 'complete' && (
              <button
                onClick={() => handleDeleteDrawing(index)}
                className="absolute top-1 right-1 rounded-full bg-red-500 p-1 text-white transition-colors hover:bg-red-700"
                aria-label="Delete drawing"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
