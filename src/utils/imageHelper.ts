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
  config: BlurConfig,
  isPremium?: boolean
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

  // If the user is on the free/trial/basic plan, add an elegant "AutoBlur.ai" watermark
  if (!isPremium) {
    const badgeHeight = Math.max(28, Math.min(70, Math.round(canvas.height * 0.035)));
    const fontSize = Math.max(10, Math.round(badgeHeight * 0.38));
    ctx.save();
    
    // Configure text font and measure width
    ctx.font = `bold ${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
    const textWidth = ctx.measureText('AutoBlur').width;
    const suffixWidth = ctx.measureText('.ai').width;
    const totalTextWidth = textWidth + suffixWidth;
    
    const logoSize = badgeHeight * 0.55;
    // Badge width with padding: logo + text + gap + left/right borders
    const badgeWidth = logoSize + totalTextWidth + (badgeHeight * 0.8);
    const padding = Math.max(12, Math.min(40, Math.round(canvas.height * 0.025)));
    
    const bx = canvas.width - badgeWidth - padding;
    const by = canvas.height - badgeHeight - padding;
    const r = badgeHeight / 2;
    
    // Draw rounded background capsule
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + badgeWidth - r, by);
    ctx.quadraticCurveTo(bx + badgeWidth, by, bx + badgeWidth, by + r);
    ctx.quadraticCurveTo(bx + badgeWidth, by + badgeHeight, bx + badgeWidth - r, by + badgeHeight);
    ctx.lineTo(bx + r, by + badgeHeight);
    ctx.quadraticCurveTo(bx, by + badgeHeight, bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'; // Slate 900 translucent
    ctx.fill();
    
    // Draw Shield Logo matching favicon SVG
    const logoX = bx + badgeHeight * 0.35;
    const logoY = by + (badgeHeight - logoSize) / 2;
    const scaleFactor = logoSize / 24;
    
    ctx.save();
    ctx.translate(logoX, logoY);
    ctx.scale(scaleFactor, scaleFactor);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#818cf8'; // indigo-400
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const path = new Path2D("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z");
    const circle = new Path2D();
    circle.arc(12, 11, 3, 0, 2 * Math.PI);
    
    ctx.stroke(path);
    ctx.stroke(circle);
    ctx.restore();
    
    // Draw text: "AutoBlur" in white and ".ai" in indigo-400
    const textX = logoX + logoSize + badgeHeight * 0.22;
    const textY = by + badgeHeight * 0.58 + fontSize * 0.12;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillText('AutoBlur', textX, textY);
    
    ctx.fillStyle = '#818cf8'; // indigo-400
    ctx.fillText('.ai', textX + textWidth, textY);
    
    ctx.restore();
  }

  return canvas.toDataURL('image/jpeg', 0.95);
}
