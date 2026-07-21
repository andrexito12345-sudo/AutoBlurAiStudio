import { FaceBoundingBox } from '../types';

export interface BlurConfig {
  style: 'gaussian' | 'pixelated' | 'censored';
  intensity: number; // 1 to 50
}

/**
 * Loads an image from a URL or DataURL and returns an HTMLImageElement
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Draws the image onto a canvas and applies blurs to detected faces
 */
export async function applyBlursToImage(
  originalSrc: string,
  faces: { box_2d: number[] }[],
  config: BlurConfig
): Promise<string> {
  const img = await loadImage(originalSrc);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D context');
  }

  // Draw original image
  ctx.drawImage(img, 0, 0);

  const imgW = canvas.width;
  const imgH = canvas.height;

  for (const face of faces) {
    // box_2d coordinates: [ymin, xmin, ymax, xmax] normalized from 0 to 1000
    const [ymin, xmin, ymax, xmax] = face.box_2d;
    
    // Convert to pixel coordinates
    const x = (xmin / 1000) * imgW;
    const y = (ymin / 1000) * imgH;
    const w = ((xmax - xmin) / 1000) * imgW;
    const h = ((ymax - ymin) / 1000) * imgH;

    // Safety checks for negative or extremely small dimensions
    if (w <= 0 || h <= 0) continue;

    ctx.save();
    
    // Create clipping path for face region (ellipse or rounded rectangle for organic feel)
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
    ctx.clip();

    if (config.style === 'gaussian') {
      // Create temporary canvas to draw the blurred slice
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
        
        // Clear clipped area on main canvas
        ctx.clearRect(x, y, w, h);
        
        // Draw back blurred
        ctx.filter = `blur(${config.intensity}px)`;
        ctx.drawImage(tempCanvas, x, y);
      }
    } else if (config.style === 'pixelated') {
      // Pixelation effect by scaling down and up
      const tempCanvas = document.createElement('canvas');
      // Scale blockiness depending on face size and intensity
      const scale = Math.max(0.02, 1 / (config.intensity * 0.8));
      const tempW = Math.max(2, Math.round(w * scale));
      const tempH = Math.max(2, Math.round(h * scale));
      
      tempCanvas.width = tempW;
      tempCanvas.height = tempH;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.imageSmoothingEnabled = false;
        tempCtx.drawImage(canvas, x, y, w, h, 0, 0, tempW, tempH);
        
        // Draw scaled slice back
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCanvas, 0, 0, tempW, tempH, x, y, w, h);
      }
    } else if (config.style === 'censored') {
      // Solid black rectangle
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, y, w, h);
    }

    ctx.restore();
  }

  return canvas.toDataURL('image/jpeg', 0.95);
}
