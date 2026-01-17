import { useState, useEffect, useRef, useCallback } from 'react';
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

export interface ShadowConfig {
  angle: number; 
  elevation: number; 
  opacity: number; 
  lightSize: number; 
  depthStrength: number; 
}

export interface Transform {
  x: number;
  y: number;
  scale: number;
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

  const [transform, setTransform] = useState<Transform>({ x: 0.5, y: 0.8, scale: 0.5 });
  const [config, setConfig] = useState<ShadowConfig>({
    angle: 120, elevation: 60, opacity: 0.85, lightSize: 15, depthStrength: 80,
  });
  const [assets, setAssets] = useState<ShadowAssets>({
    fgFile: null, bgImage: null, depthImage: null, depthSource: 'none', cutout: null,
  });

  const isDragging = useRef<boolean>(false);
  const dragOffset = useRef<{ x: number, y: number }>({ x: 0, y: 0 });

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
    setStatus("🔍 Scanning Geometry...");
    try {
      const depthEstimator = await pipeline('depth-estimation', 'Xenova/depth-anything-small-hf');
      const output = await depthEstimator(bgUrl) as any;
      const rawImage = output.depth; 
      const data = rawImage.data;

      let min = 255, max = 0;
      for (let i = 0; i < data.length; i++) {
        if (data[i] < min) min = data[i];
        if (data[i] > max) max = data[i];
      }
      const range = max - min || 1;

      const canvas = document.createElement('canvas');
      canvas.width = rawImage.width;
      canvas.height = rawImage.height;
      const ctx = canvas.getContext('2d')!;
      const pixelData = ctx.createImageData(canvas.width, canvas.height);

      for (let i = 0; i < data.length; i++) {
         const norm = ((data[i] - min) / range) * 255;
         pixelData.data[i*4] = norm; pixelData.data[i*4+1] = norm; pixelData.data[i*4+2] = norm; pixelData.data[i*4+3] = 255;
      }
      ctx.putImageData(pixelData, 0, 0);
      const depthImg = await loadImage(canvas.toDataURL());
      setAssets(prev => ({ ...prev, depthImage: depthImg, depthSource: 'ai' }));
      setStatus("✅ Geometry Ready");
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

    if (layer === 'composite') ctx.drawImage(bgImage, 0, 0, width, height);

    const w = cutout.width * transform.scale;
    const h = cutout.height * transform.scale;
    const px = transform.x * width; 
    const py = transform.y * height;
    const x = px - (w / 2);
    const y = py - h;

    if (layer === 'mask') {
       ctx.drawImage(cutout, x, y, w, h);
       return; 
    }

    const radAngle = (config.angle * Math.PI) / 180;
    const radElev = (Math.max(10, config.elevation) * Math.PI) / 180;
    const tanElev = Math.tan(radElev);
    const vecX = Math.cos(radAngle);
    const vecY = Math.sin(radAngle);
    const K = 1 / tanElev;
    const shearX = -K * vecX;
    const shearY = -K * vecY;

    const flatCanvas = document.createElement('canvas');
    flatCanvas.width = width;
    flatCanvas.height = height;
    const fCtx = flatCanvas.getContext('2d', { willReadFrequently: true })!;

    fCtx.translate(px, py);
    fCtx.transform(1, 0, shearX, shearY, 0, 0); 
    fCtx.scale(1, -0.5); 
    fCtx.translate(-px, -py);
    fCtx.drawImage(cutout, x, y, w, h);

    fCtx.globalCompositeOperation = 'source-in';
    fCtx.fillStyle = 'black';
    fCtx.fillRect(0, 0, width, height);

    const warpedCanvas = document.createElement('canvas');
    warpedCanvas.width = width;
    warpedCanvas.height = height;
    const wCtx = warpedCanvas.getContext('2d')!;

    if (depthImage && config.depthStrength > 0) {
      const flatData = fCtx.getImageData(0, 0, width, height);
      const warpedData = wCtx.createImageData(width, height);

      const dCvs = document.createElement('canvas');
      dCvs.width = width;
      dCvs.height = height;
      const dCtx = dCvs.getContext('2d', { willReadFrequently: true })!;
      dCtx.drawImage(depthImage, 0, 0, width, height);
      const depthData = dCtx.getImageData(0, 0, width, height).data;

      const feetIdx = (Math.floor(py) * width + Math.floor(px)) * 4;
      const groundVal = depthData[feetIdx] || 0; 
      const heightScale = config.depthStrength / 255;
      const skyThreshold = 25; const skyFadeRange = 25;

      for (let rY = 0; rY < height; rY++) {
        for (let rX = 0; rX < width; rX++) {
          const i = (rY * width + rX) * 4;
          const rawDepth = depthData[i];

          let skyOpacity = 1.0;
          if (rawDepth < skyThreshold) skyOpacity = 0.0;
          else if (rawDepth < skyThreshold + skyFadeRange) skyOpacity = (rawDepth - skyThreshold) / skyFadeRange;

          if (skyOpacity > 0) {
             const pixelHeight = (rawDepth - groundVal) * heightScale;
             const shiftLen = pixelHeight / tanElev;
             const srcX = rX - (vecX * shiftLen);
             const srcY = rY - (vecY * shiftLen);

             if (srcX >= 0 && srcX < width - 1 && srcY >= 0 && srcY < height - 1) {
                const x0 = Math.floor(srcX); const y0 = Math.floor(srcY);
                const dx = srcX - x0; const dy = srcY - y0;
                const i00 = (y0 * width + x0) * 4 + 3;
                const i10 = (y0 * width + (x0+1)) * 4 + 3;
                const i01 = ((y0+1) * width + x0) * 4 + 3;
                const i11 = ((y0+1) * width + (x0+1)) * 4 + 3;
                const top = flatData.data[i00] * (1 - dx) + flatData.data[i10] * dx;
                const bot = flatData.data[i01] * (1 - dx) + flatData.data[i11] * dx;
                const finalAlpha = top * (1 - dy) + bot * dy;
                if (finalAlpha > 10) warpedData.data[i + 3] = finalAlpha * skyOpacity;
             }
          }
        }
      }
      wCtx.putImageData(warpedData, 0, 0);
    } else {
      wCtx.drawImage(flatCanvas, 0, 0);
    }

    const finalShadowCanvas = document.createElement('canvas');
    finalShadowCanvas.width = width;
    finalShadowCanvas.height = height;
    const fsCtx = finalShadowCanvas.getContext('2d')!;

    fsCtx.globalAlpha = config.opacity;
    fsCtx.filter = 'blur(1px)';
    fsCtx.drawImage(warpedCanvas, 0, 0);
    fsCtx.filter = 'none';

    if (config.lightSize > 0) {
        const blurLayer = document.createElement('canvas');
        blurLayer.width = width;
        blurLayer.height = height;
        const bCtx = blurLayer.getContext('2d')!;
        bCtx.filter = `blur(${config.lightSize}px)`;
        bCtx.drawImage(warpedCanvas, 0, 0);

        const shadowLen = h * K; 
        const gEnd = { x: px + Math.cos(radAngle) * shadowLen * 1.2, y: py + Math.sin(radAngle) * shadowLen * 1.2 };

        bCtx.globalCompositeOperation = 'destination-in';
        const blurMask = bCtx.createLinearGradient(px, py, gEnd.x, gEnd.y);
        blurMask.addColorStop(0, 'rgba(0,0,0,0)');
        blurMask.addColorStop(0.3, 'rgba(0,0,0,0.8)'); 
        blurMask.addColorStop(1, 'rgba(0,0,0,1)');
        bCtx.fillStyle = blurMask;
        bCtx.fillRect(0, 0, width, height);

        fsCtx.globalAlpha = 0.6;
        fsCtx.drawImage(blurLayer, 0, 0);
    }

    fsCtx.globalCompositeOperation = 'destination-in';
    const shadowLen = h * K;
    const gEnd = { x: px + Math.cos(radAngle) * shadowLen, y: py + Math.sin(radAngle) * shadowLen };
    const alphaMask = fsCtx.createLinearGradient(px, py, gEnd.x, gEnd.y);
    alphaMask.addColorStop(0, 'rgba(0,0,0,1)');
    alphaMask.addColorStop(0.6, 'rgba(0,0,0,0.9)');
    alphaMask.addColorStop(1, 'rgba(0,0,0,0)');
    fsCtx.fillStyle = alphaMask;
    fsCtx.fillRect(0, 0, width, height);

    ctx.drawImage(finalShadowCanvas, 0, 0);

    if (layer === 'composite') {
        ctx.drawImage(cutout, x, y, w, h);

        ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
  }, [assets, config, transform]);

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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canvasRef.current || !assets.cutout) return;

    const rect = canvasRef.current.getBoundingClientRect();

    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const width = canvasRef.current.width;
    const height = canvasRef.current.height;
    const w = assets.cutout.width * transform.scale;
    const h = assets.cutout.height * transform.scale;

    const px = transform.x * width;
    const py = transform.y * height;

    const boxX = px - (w / 2);
    const boxY = py - h;

    if (
        mouseX >= boxX && 
        mouseX <= boxX + w && 
        mouseY >= boxY && 
        mouseY <= boxY + h
    ) {
        isDragging.current = true;

        dragOffset.current = {
            x: transform.x - (e.clientX - rect.left) / rect.width,
            y: transform.y - (e.clientY - rect.top) / rect.height
        };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseNormX = (e.clientX - rect.left) / rect.width;
    const mouseNormY = (e.clientY - rect.top) / rect.height;

    setTransform(prev => ({
        ...prev,
        x: mouseNormX + dragOffset.current.x,
        y: mouseNormY + dragOffset.current.y
    }));
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const triggerDownload = (layer: 'composite' | 'shadow' | 'mask') => {
    if (!assets.bgImage) return;
    const cvs = document.createElement('canvas');
    cvs.width = assets.bgImage.width;
    cvs.height = assets.bgImage.height;
    const ctx = cvs.getContext('2d')!;
    renderCanvas(ctx, cvs.width, cvs.height, layer);
    const link = document.createElement('a');
    link.download = layer + '.png';
    link.href = cvs.toDataURL();
    link.click();
  };

  return { 
    canvasRef, status, config, setConfig, assets, handleUpload, runExtraction, triggerDownload,
    transform, setTransform, handleMouseDown, handleMouseMove, handleMouseUp 
  };
};