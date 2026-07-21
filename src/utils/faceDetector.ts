import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { loadImage } from './imageHelper';

// Pin the version so the WASM bundle matches the installed npm package
const TASKS_VISION_VERSION = '0.10.35';
const WASM_PATH = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-assets/face_detection_short_range.tflite';

let detectorPromise: Promise<FaceDetector> | null = null;

/**
 * Lazily initializes (once) the MediaPipe FaceDetector for static images.
 * Runs fully client-side, no backend or API key required.
 */
async function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
      return FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_PATH,
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
      });
    })().catch((err) => {
      // Reset so a later attempt can retry (e.g. transient CDN/GPU failure)
      detectorPromise = null;
      throw err;
    });
  }
  return detectorPromise;
}

/**
 * Detects faces in the given image and returns bounding boxes in the same
 * normalized [ymin, xmin, ymax, xmax] 0-1000 format the blur pipeline expects.
 */
export async function detectFaces(
  imageSrc: string
): Promise<{ box_2d: number[] }[]> {
  const detector = await getDetector();
  const img = await loadImage(imageSrc);

  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  if (!imgW || !imgH) return [];

  const result = detector.detect(img);

  return (result.detections || [])
    .map((det) => {
      const box = det.boundingBox;
      if (!box) return null;

      // MediaPipe returns pixel coordinates (originX/originY = top-left)
      const xmin = (box.originX / imgW) * 1000;
      const ymin = (box.originY / imgH) * 1000;
      const xmax = ((box.originX + box.width) / imgW) * 1000;
      const ymax = ((box.originY + box.height) / imgH) * 1000;

      // Clamp to valid range
      const clamp = (v: number) => Math.max(0, Math.min(1000, Math.round(v)));

      return { box_2d: [clamp(ymin), clamp(xmin), clamp(ymax), clamp(xmax)] };
    })
    .filter((b): b is { box_2d: number[] } => b !== null);
}
