import { useState, useEffect, useRef, useCallback } from 'react';
import { pipeline, env, RawImage } from '@huggingface/transformers';

// Configure Transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

export interface ShadowConfig {
  angle: number;      // 0-360 deg (Azimuth)
  elevation: number;  // 0-90 deg (Altitude)
  opacity: number;    // 0-1
  blur: number;       // px
  depthStrength: number; // 0-100
}

export interface ShadowAssets {
  fgFile: File | null;
  bgImage: HTMLImageElement | null;
  // We distinguish between User Uploaded vs AI Generated depth maps
  depthImage: HTMLImageElement | null; 
  depthSource: 'none' | 'user' | 'ai';
  cutout: HTMLImageElement | null;
}

export const useShadowGenerator = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // State
  const [status, setStatus] = useState<string>('Idle');
  const [config, setConfig] = useState<ShadowConfig>({
    angle: 120, // Sun coming from top-leftish
    elevation: 60,
    opacity: 0.6,
    blur: 6,
    depthStrength: 20,
  });

  const [assets, setAssets] = useState<ShadowAssets>({
    fgFile: null,
    bgImage: null,
    depthImage: null,
    depthSource: 'none',
    cutout: null,
  });

  // --- Helpers ---
  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.src = src;
    });
  };

  const handleUpload = async (file: File, type: 'fg' | 'bg' | 'depth') => {
    const url = URL.createObjectURL(file);
    
    if (type === 'fg') {
      setAssets(prev => ({ ...prev, fgFile: file, cutout: null }));
    } else if (type === 'depth') {
      const img = await loadImage(url);
      setAssets(prev => ({ ...prev, depthImage: img, depthSource: 'user' }));
    } else {
      // Background Upload triggers Auto-Depth if no user depth map exists
      const img = await loadImage(url);
      setAssets(prev => ({ ...prev, bgImage: img }));
      
      // Trigger Auto-Depth if we don't have a user-provided one
      if (assets.depthSource !== 'user') {
        generateDepthMap(url);
      }
    }
  };

  // --- AI Pipeline 1: Depth Estimation ---
  const generateDepthMap = async (bgUrl: string) => {
    setStatus("🔍 Generating Depth Map...");
    try {
      // Use 'depth-anything-small-hf' for decent speed/quality balance in browser
      const depthEstimator = await pipeline('depth-estimation', 'Xenova/depth-anything-small-hf');
      
      const output = await depthEstimator(bgUrl);
      
      // Output is usually a RawImage or similar tensor wrapper. 
      // We need to convert it to a canvas/image for our renderer.
      // @ts-ignore - The types for transformers.js output can be tricky
      const rawImage = output.depth; 
      
      const canvas = document.createElement('canvas');
      canvas.width = rawImage.width;
      canvas.height = rawImage.height;
      const ctx = canvas.getContext('2d')!;
      
      // Create ImageData from the raw tensor data
      // Depth Anything outputs float32 [0,1] or uint8 [0,255]. 
      // We assume it returns a standard image-like structure we can draw or we create pixels.
      // For simplicity with this specific pipeline wrapper, let's create a blob from the output if available,
      // or manually map the pixel data.
      
      // Robust Fallback: Manually copy data
      const pixelData = ctx.createImageData(canvas.width, canvas.height);
      const data = rawImage.data; // Uint8Array
      for (let i = 0; i < data.length; i++) {
         // Grayscale copy
         const val = data[i];
         pixelData.data[i*4] = val;
         pixelData.data[i*4+1] = val;
         pixelData.data[i*4+2] = val;
         pixelData.data[i*4+3] = 255;
      }
      ctx.putImageData(pixelData, 0, 0);

      const depthImg = await loadImage(canvas.toDataURL());
      setAssets(prev => ({ ...prev, depthImage: depthImg, depthSource: 'ai' }));
      setStatus("✅ Ready");

    } catch (err) {
      console.error("Depth Generation Failed", err);
      // Don't block the UI, just warn
      setStatus("⚠️ Depth Gen Failed (Warp Disabled)");
      setAssets(prev => ({ ...prev, depthSource: 'none', depthImage: null }));
    }
  };

  // --- AI Pipeline 2: Subject Extraction ---
  const runExtraction = useCallback(async () => {
    if (!assets.fgFile) return;
    setStatus("✂️ Extracting Subject...");

    try {
      const segmenter = await pipeline('image-segmentation', 'briaai/RMBG-1.4');
      const objectUrl = URL.createObjectURL(assets.fgFile);
      const output = await segmenter(objectUrl);
      const mask = output[0].mask; 

      const original = await loadImage(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = mask.width;
      canvas.height = mask.height;
      const ctx = canvas.getContext('2d')!;

      ctx.drawImage(original, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      for (let i = 0; i < mask.data.length; i++) {
        imgData.data[i * 4 + 3] = mask.data[i];
      }
      ctx.putImageData(imgData, 0, 0);

      const cutoutImg = await loadImage(canvas.toDataURL());
      setAssets(prev => ({ ...prev, cutout: cutoutImg }));
      setStatus("✅ Ready");

    } catch (err: any) {
      console.error(err);
      setStatus("❌ Extraction Error");
    }
  }, [assets.fgFile]);

  // --- Render Loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const { bgImage, cutout, depthImage } = assets;
    
    if (!canvas || !bgImage || !cutout) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // 1. Setup Canvas
    canvas.width = bgImage.width;
    canvas.height = bgImage.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bgImage, 0, 0);

    // --- Shadow Logic ---
    ctx.save();

    // A. Positioning (Subject)
    const scale = Math.min(
      (bgImage.width * 0.5) / cutout.width, 
      (bgImage.height * 0.7) / cutout.height
    );
    const w = cutout.width * scale;
    const h = cutout.height * scale;
    const x = (bgImage.width - w) / 2;
    const y = bgImage.height - h - (bgImage.height * 0.1);
    
    // Pivot = Feet
    const pivotX = x + w / 2;
    const pivotY = y + h;

    // B. Physical Projection Math (Shear)
    // Convert angle to radians
    // 0 deg = Shadow to Right (Light from Left)
    // 90 deg = Shadow to Back (Light from Front)
    const radAngle = (config.angle * Math.PI) / 180;
    const radElev = (Math.max(5, config.elevation) * Math.PI) / 180;
    
    // Shadow Length Factor (L = 1/tan(elev))
    const K = 1 / Math.tan(radElev);

    // Shear Factors based on light angle
    // dx = -K * cos(angle)
    // dy = -K * sin(angle)
    const shearX = -K * Math.cos(radAngle);
    const shearY = -K * Math.sin(radAngle);

    // Create Offscreen Shadow Buffer
    const sCanvas = document.createElement('canvas');
    sCanvas.width = canvas.width;
    sCanvas.height = canvas.height;
    const sCtx = sCanvas.getContext('2d')!;

    // Move to pivot, Apply Shear Matrix, Move back
    sCtx.translate(pivotX, pivotY);
    
    // Matrix: [hScale, vSkew, hSkew, vScale, dx, dy]
    // We want: x' = x + y*shearX, y' = y + y*shearY
    // Note: Canvas Y is down. A "ground" shadow usually involves scaling Y to 0 (flat) 
    // but in 2D compositing we usually Flip Y and Skew.
    
    // Method:
    // 1. Flip Y (Shadow projects away/down)
    // 2. Skew X/Y based on light direction
    sCtx.transform(1, 0, shearX, shearY, 0, 0); // Apply Shear to the "Vertical" axis of sprite
    sCtx.scale(1, -0.5); // Flip and squash height to make it look like it's on floor
    
    sCtx.translate(-pivotX, -pivotY);
    
    // Draw Silhouette
    sCtx.drawImage(cutout, x, y, w, h);

    // C. Color & Contact Gradient
    sCtx.globalCompositeOperation = 'source-in';
    sCtx.fillStyle = 'black';
    sCtx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply Gradient Fade (Contact Shadow)
    sCtx.globalCompositeOperation = 'destination-in';
    
    // Gradient should follow the shadow direction
    // We approximate the "end" of the shadow for the gradient
    const shadowLenPixels = h * K; 
    const gEnd = {
      x: pivotX + Math.cos(radAngle) * shadowLenPixels,
      y: pivotY + Math.sin(radAngle) * shadowLenPixels
    };
    
    const grad = sCtx.createLinearGradient(pivotX, pivotY, gEnd.x, gEnd.y);
    grad.addColorStop(0, `rgba(0,0,0,${config.opacity})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, canvas.width, canvas.height);

    // D. Depth Warp (Displacement)
    // Only run if we have a valid depth image
    if (depthImage && config.depthStrength > 0) {
      const sData = sCtx.getImageData(0, 0, canvas.width, canvas.height);
      const dCanvas = document.createElement('canvas');
      dCanvas.width = canvas.width;
      dCanvas.height = canvas.height;
      const dCtx = dCanvas.getContext('2d')!;
      dCtx.drawImage(depthImage, 0, 0, canvas.width, canvas.height);
      const dData = dCtx.getImageData(0, 0, canvas.width, canvas.height).data;
      
      const output = sCtx.createImageData(canvas.width, canvas.height);
      
      // We displace along the Light Vector
      // If light comes from LEFT, shadow hits LEFT side of bumps first.
      const vecX = Math.cos(radAngle);
      const vecY = Math.sin(radAngle);

      for (let py = 0; py < canvas.height; py++) {
        for (let px = 0; px < canvas.width; px++) {
          const i = (py * canvas.width + px) * 4;
          const depthVal = dData[i]; // 0-255 (255 = Close/High, 0 = Far/Low)
          
          if (depthVal > 0) {
            // Calculate displacement
            // Higher depth = Shift shadow "towards" light (blocking it) 
            // OR shift "away" depending on bump vs hole. 
            // Let's assume White = Bump. Shadow should be delayed (shifted back).
            
            const normDepth = depthVal / 255;
            const shift = normDepth * config.depthStrength;
            
            // Sample from "upstream"
            const srcX = Math.floor(px - (vecX * shift));
            const srcY = Math.floor(py - (vecY * shift));

            if (srcX >= 0 && srcX < canvas.width && srcY >= 0 && srcY < canvas.height) {
              const srcI = (srcY * canvas.width + srcX) * 4;
              output.data[i] = sData.data[srcI];
              output.data[i+1] = sData.data[srcI+1];
              output.data[i+2] = sData.data[srcI+2];
              output.data[i+3] = sData.data[srcI+3];
            }
          } else {
             // Pass through
             output.data[i] = sData.data[i];
             output.data[i+1] = sData.data[i+1];
             output.data[i+2] = sData.data[i+2];
             output.data[i+3] = sData.data[i+3];
          }
        }
      }
      sCtx.putImageData(output, 0, 0);
    }

    // E. Draw Final Shadow
    ctx.filter = `blur(${config.blur}px)`;
    ctx.drawImage(sCanvas, 0, 0);
    ctx.filter = 'none';
    ctx.restore();
    
    // Draw Subject
    ctx.drawImage(cutout, x, y, w, h);

  }, [assets, config]);

  return {
    canvasRef,
    status,
    config,
    setConfig,
    assets,
    handleUpload,
    runExtraction
  };
};