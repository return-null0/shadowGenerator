import { useState, useEffect, useRef, useCallback } from 'react';
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

export interface ShadowConfig {
  angle: number; elevation: number; opacity: number; blur: number; depthStrength: number;
}

export interface ShadowAssets {
  fgFile: File | null;
  bgImage: HTMLImageElement | null;
  depthImage: HTMLImageElement | null; 
  depthSource: 'none' | 'user' | 'ai';
  cutout: HTMLImageElement | null;
}

export const useShadowGenerator = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string>('Idle');
  const [config, setConfig] = useState<ShadowConfig>({
    angle: 120, elevation: 60, opacity: 0.6, blur: 6, depthStrength: 20,
  });
  const [assets, setAssets] = useState<ShadowAssets>({
    fgFile: null, bgImage: null, depthImage: null, depthSource: 'none', cutout: null,
  });

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
      const img = await loadImage(url);
      setAssets(prev => ({ ...prev, bgImage: img }));
      if (assets.depthSource !== 'user') generateDepthMap(url);
    }
  };

  const generateDepthMap = async (bgUrl: string) => {
    setStatus("🔍 Generating Depth...");
    try {
      const depthEstimator = await pipeline('depth-estimation', 'Xenova/depth-anything-small-hf');
      const output = await depthEstimator(bgUrl) as any;
      const rawImage = output.depth; 
      const canvas = document.createElement('canvas');
      canvas.width = rawImage.width;
      canvas.height = rawImage.height;
      const ctx = canvas.getContext('2d')!;
      const pixelData = ctx.createImageData(canvas.width, canvas.height);
      const data = rawImage.data; 
      for (let i = 0; i < data.length; i++) {
         const val = data[i];
         pixelData.data[i*4] = val; pixelData.data[i*4+1] = val; pixelData.data[i*4+2] = val; pixelData.data[i*4+3] = 255;
      }
      ctx.putImageData(pixelData, 0, 0);
      const depthImg = await loadImage(canvas.toDataURL());
      setAssets(prev => ({ ...prev, depthImage: depthImg, depthSource: 'ai' }));
      setStatus("✅ Ready");
    } catch (err) {
      console.error(err);
      setStatus("⚠️ Depth Failed");
      setAssets(prev => ({ ...prev, depthSource: 'none', depthImage: null }));
    }
  };

  const runExtraction = useCallback(async () => {
    if (!assets.fgFile) return;
    setStatus("✂️ Extracting...");
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
      setStatus("❌ Error");
    }
  }, [assets.fgFile]);

  const renderCanvas = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, layer: 'composite' | 'shadow' | 'mask') => {
    const { bgImage, cutout, depthImage } = assets;
    if (!bgImage || !cutout) return;

    ctx.clearRect(0, 0, width, height);
    if (layer === 'composite') {
      ctx.drawImage(bgImage, 0, 0, width, height);
    }

    if (layer === 'mask') {
       const scale = Math.min((width * 0.5) / cutout.width, (height * 0.7) / cutout.height);
       const w = cutout.width * scale;
       const h = cutout.height * scale;
       const x = (width - w) / 2;
       const y = height - h - (height * 0.1);
       ctx.drawImage(cutout, x, y, w, h);
       return; 

    }

    const scale = Math.min((width * 0.5) / cutout.width, (height * 0.7) / cutout.height);
    const w = cutout.width * scale;
    const h = cutout.height * scale;
    const x = (width - w) / 2;
    const y = height - h - (height * 0.1);
    const pivotX = x + w / 2;
    const pivotY = y + h;

    const radAngle = (config.angle * Math.PI) / 180;
    const radElev = (Math.max(5, config.elevation) * Math.PI) / 180;
    const K = 1 / Math.tan(radElev);
    const shearX = -K * Math.cos(radAngle);
    const shearY = -K * Math.sin(radAngle);

    const sCanvas = document.createElement('canvas');
    sCanvas.width = width;
    sCanvas.height = height;
    const sCtx = sCanvas.getContext('2d')!;

    sCtx.translate(pivotX, pivotY);
    sCtx.transform(1, 0, shearX, shearY, 0, 0); 
    sCtx.scale(1, -0.5); 
    sCtx.translate(-pivotX, -pivotY);
    sCtx.drawImage(cutout, x, y, w, h);

    sCtx.globalCompositeOperation = 'source-in';
    sCtx.fillStyle = 'black';
    sCtx.fillRect(0, 0, width, height);

    sCtx.globalCompositeOperation = 'destination-in';
    const shadowLenPixels = h * K; 
    const gEnd = { x: pivotX + Math.cos(radAngle) * shadowLenPixels, y: pivotY + Math.sin(radAngle) * shadowLenPixels };
    const grad = sCtx.createLinearGradient(pivotX, pivotY, gEnd.x, gEnd.y);
    grad.addColorStop(0, `rgba(0,0,0,${config.opacity})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, width, height);

    if (depthImage && config.depthStrength > 0) {
      const sData = sCtx.getImageData(0, 0, width, height);
      const dCanvas = document.createElement('canvas');
      dCanvas.width = width;
      dCanvas.height = height;
      const dCtx = dCanvas.getContext('2d')!;
      dCtx.drawImage(depthImage, 0, 0, width, height);
      const dData = dCtx.getImageData(0, 0, width, height).data;
      const output = sCtx.createImageData(width, height);
      const vecX = Math.cos(radAngle);
      const vecY = Math.sin(radAngle);

      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const i = (py * width + px) * 4;
          const depthVal = dData[i]; 
          if (depthVal > 0) {
            const shift = (depthVal / 255) * config.depthStrength;
            const srcX = Math.floor(px - (vecX * shift));
            const srcY = Math.floor(py - (vecY * shift));
            if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
              const srcI = (srcY * width + srcX) * 4;
              output.data[i] = sData.data[srcI]; output.data[i+1] = sData.data[srcI+1]; output.data[i+2] = sData.data[srcI+2]; output.data[i+3] = sData.data[srcI+3];
            }
          } else {
             output.data[i] = sData.data[i]; output.data[i+1] = sData.data[i+1]; output.data[i+2] = sData.data[i+2]; output.data[i+3] = sData.data[i+3];
          }
        }
      }
      sCtx.putImageData(output, 0, 0);
    }

    ctx.filter = `blur(${config.blur}px)`;
    ctx.drawImage(sCanvas, 0, 0);
    ctx.filter = 'none';

    if (layer === 'composite') {
       ctx.drawImage(cutout, x, y, w, h);
    }
  }, [assets, config]);

  useEffect(() => {
    if (!canvasRef.current || !assets.bgImage) return;
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (canvasRef.current.width !== assets.bgImage.width) {
        canvasRef.current.width = assets.bgImage.width;
        canvasRef.current.height = assets.bgImage.height;
    }

    renderCanvas(ctx, assets.bgImage.width, assets.bgImage.height, 'composite');
  }, [renderCanvas, assets.bgImage]); 

  const triggerDownload = (layer: 'composite' | 'shadow' | 'mask') => {
    if (!assets.bgImage) return;

    const cvs = document.createElement('canvas');
    cvs.width = assets.bgImage.width;
    cvs.height = assets.bgImage.height;
    const ctx = cvs.getContext('2d')!;

    renderCanvas(ctx, cvs.width, cvs.height, layer);

    const link = document.createElement('a');
    let filename = 'composite.png';
    if (layer === 'shadow') filename = 'shadow_only.png';
    if (layer === 'mask') filename = 'mask_debug.png';

    link.download = filename;
    link.href = cvs.toDataURL();
    link.click();
  };

  return {
    canvasRef, status, config, setConfig, assets, handleUpload, runExtraction, triggerDownload
  };
};