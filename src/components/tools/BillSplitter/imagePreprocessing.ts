const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const MAX_RECEIPT_DIMENSION = 2600;
const MAX_RECEIPT_PIXELS = 12_000_000;
const INITIAL_JPEG_QUALITY = 0.9;
const MIN_JPEG_QUALITY = 0.5;
const RESIZE_STEP = 0.85;
const MAX_COMPRESSION_ATTEMPTS = 8;

export const IMAGE_TOO_LARGE_MESSAGE = 'Image is still too large after compression. Try a closer crop.';

export class ImageTooLargeError extends Error {
  constructor(message = IMAGE_TOO_LARGE_MESSAGE) {
    super(message);
    this.name = 'ImageTooLargeError';
  }
}

const getJpegFileName = (name: string): string => {
  const baseName = name.replace(/\.[^/.]+$/, '');
  return `${baseName || 'receipt'}.jpg`;
};

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error('Failed to compress image.'));
      },
      'image/jpeg',
      quality
    );
  });
};

const loadImageFromFile = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to read image.'));
    };

    image.src = objectUrl;
  });
};

const getConstrainedSize = (width: number, height: number): { width: number; height: number } => {
  const largestDimension = Math.max(width, height);
  let scaleByDimension = 1;
  if (largestDimension > MAX_RECEIPT_DIMENSION) {
    scaleByDimension = MAX_RECEIPT_DIMENSION / largestDimension;
  }

  const totalPixels = width * height;
  let scaleByPixels = 1;
  if (totalPixels > MAX_RECEIPT_PIXELS) {
    scaleByPixels = Math.sqrt(MAX_RECEIPT_PIXELS / totalPixels);
  }

  const scale = Math.min(scaleByDimension, scaleByPixels, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
};

export const preprocessReceiptImage = async (file: File): Promise<File> => {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  const image = await loadImageFromFile(file);
  const constrainedSize = getConstrainedSize(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const shouldDownscale =
    constrainedSize.width < (image.naturalWidth || image.width) || constrainedSize.height < (image.naturalHeight || image.height);

  if (file.size <= MAX_UPLOAD_BYTES && !shouldDownscale) {
    return file;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    return file;
  }

  let width = constrainedSize.width;
  let height = constrainedSize.height;
  let quality = INITIAL_JPEG_QUALITY;

  for (let attempt = 0; attempt < MAX_COMPRESSION_ATTEMPTS; attempt += 1) {
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const compressedBlob = await canvasToBlob(canvas, quality);

    if (compressedBlob.size <= MAX_UPLOAD_BYTES) {
      return new File([compressedBlob], getJpegFileName(file.name), {
        type: 'image/jpeg',
        lastModified: Date.now()
      });
    }

    if (quality > MIN_JPEG_QUALITY) {
      quality = Math.max(MIN_JPEG_QUALITY, quality - 0.1);
      continue;
    }

    width = Math.max(1, Math.round(width * RESIZE_STEP));
    height = Math.max(1, Math.round(height * RESIZE_STEP));
    quality = INITIAL_JPEG_QUALITY;
  }

  throw new ImageTooLargeError();
};
