import React from 'react';
import { useShadowGenerator } from './useShadowGenerator';

const ShadowCompositor: React.FC = () => {
  const {
    canvasRef, status, config, setConfig, assets, handleUpload, runExtraction, triggerDownload,
    transform, setTransform, handleMouseDown, handleMouseMove, handleMouseUp
  } = useShadowGenerator();

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Shadow<span style={styles.titleAccent}>Forge</span> <span style={styles.beta}>PRO</span></h1>
        </div>

        <div style={{...styles.statusBadge, ...(status.includes('✅') ? styles.statusSuccess : {})}}>
          {status}
        </div>

        <div style={{display: 'flex', gap: '8px'}}>
            <button onClick={() => triggerDownload('shadow')} disabled={!assets.bgImage || !assets.cutout} style={styles.debugBtn}>🖤 Shadow</button>
            <button onClick={() => triggerDownload('mask')} disabled={!assets.bgImage || !assets.cutout} style={styles.debugBtn}>✂️ Mask</button>
            <button onClick={() => triggerDownload('composite')} disabled={!assets.bgImage || !assets.cutout} style={styles.downloadBtn}>💾 Save</button>
        </div>
      </header>

      <div style={styles.workspace}>
        <aside style={styles.sidebar}>
          {}
          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>📂 Assets</h3>
            <div style={styles.inputGroup}>
              <label style={styles.label}>1. Subject</label>
              <input type="file" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'fg')} style={styles.fileInput} />
              <button onClick={runExtraction} disabled={!assets.fgFile || status.includes('Extraction')} style={{...styles.actionBtn, ...(assets.cutout ? styles.btnOutline : styles.btnPrimary)}}>
                {assets.cutout ? '🔄 Re-Extract' : '✂️ Extract Subject'}
              </button>
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.label}>2. Background</label>
              <input type="file" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'bg')} style={styles.fileInput} />
            </div>
            <div style={styles.inputGroup}>
              <div style={styles.rowHeader}>
                <label style={styles.label}>3. Depth Map</label>
                {assets.depthSource === 'ai' && <span style={styles.tagAi}>AI Generated</span>}
              </div>
              <input type="file" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'depth')} style={styles.fileInput} />
            </div>
          </div>

          {}
          <div style={{...styles.panel, ...((!assets.bgImage || !assets.cutout) ? styles.disabled : {})}}>
             <h3 style={styles.panelTitle}>📐 Transform</h3>
             <div style={styles.controlRow}>
              <div style={styles.rowHeader}><span style={styles.label}>Scale</span><span style={styles.value}>{Math.round(transform.scale * 100)}%</span></div>
              <input type="range" min="0.1" max="1.5" step="0.05" value={transform.scale} onChange={(e) => setTransform({...transform, scale: +e.target.value})} style={styles.slider} />
             </div>
             <p style={styles.helperText}>💡 Drag subject on canvas to move</p>
          </div>

          {}
          <div style={{...styles.panel, ...((!assets.bgImage || !assets.cutout) ? styles.disabled : {})}}>
            <h3 style={styles.panelTitle}>☀️ Light Source</h3>
            <div style={styles.controlRow}>
              <div style={styles.rowHeader}><span style={styles.label}>Angle</span><span style={styles.value}>{config.angle}°</span></div>
              <input type="range" min="0" max="360" value={config.angle} onChange={(e) => setConfig({...config, angle: +e.target.value})} style={styles.slider} />
            </div>
            <div style={styles.controlRow}>
              <div style={styles.rowHeader}><span style={styles.label}>Elevation</span><span style={styles.value}>{config.elevation}°</span></div>
              <input type="range" min="10" max="85" value={config.elevation} onChange={(e) => setConfig({...config, elevation: +e.target.value})} style={styles.slider} />
            </div>
          </div>

          {}
          <div style={{...styles.panel, ...((!assets.bgImage || !assets.cutout) ? styles.disabled : {})}}>
            <h3 style={styles.panelTitle}>🎨 Shadow Physics</h3>
            <div style={styles.controlRow}>
              <div style={styles.rowHeader}><span style={styles.label}>Opacity</span><span style={styles.value}>{config.opacity}</span></div>
              <input type="range" min="0" max="1" step="0.05" value={config.opacity} onChange={(e) => setConfig({...config, opacity: +e.target.value})} style={styles.slider} />
            </div>
            <div style={styles.controlRow}>
              <div style={styles.rowHeader}><span style={styles.label}>Light Size (Blur)</span><span style={styles.value}>{config.lightSize}px</span></div>
              <input type="range" min="0" max="30" value={config.lightSize} onChange={(e) => setConfig({...config, lightSize: +e.target.value})} style={styles.slider} />
            </div>
            <div style={styles.controlRow}>
              <div style={styles.rowHeader}><span style={styles.label}>Depth Warp</span><span style={styles.value}>{config.depthStrength}</span></div>
              <input type="range" min="0" max="100" disabled={!assets.depthImage} value={config.depthStrength} onChange={(e) => setConfig({...config, depthStrength: +e.target.value})} style={styles.slider} />
            </div>
          </div>
        </aside>

        {}
        <main style={styles.main} 
          onMouseDown={handleMouseDown} 
          onMouseMove={handleMouseMove} 
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {!assets.bgImage || !assets.cutout ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>🖼️</div>
              <h3>Ready to Forge</h3>
              <p style={{color: '#666'}}>1. Upload Subject & Background</p>
            </div>
          ) : (
            <div style={styles.canvasWrapper}><canvas ref={canvasRef} style={styles.canvas} /></div>
          )}
        </main>
      </div>
    </div>
  );
};

// --- STYLES ---
const styles: Record<string, React.CSSProperties> = {
  container: { height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#121212', color: '#e0e0e0', fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden' },
  header: { height: '60px', flexShrink: 0, backgroundColor: '#1a1a1a', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 20px', justifyContent: 'space-between' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '15px' },
  title: { margin: 0, fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.02em' },
  titleAccent: { color: '#3b82f6' },
  beta: { fontSize: '0.7rem', backgroundColor: '#3b82f6', color: 'white', padding: '2px 6px', borderRadius: '4px', verticalAlign: 'middle' },
  statusBadge: { fontSize: '0.8rem', backgroundColor: '#333', color: '#ccc', padding: '4px 12px', borderRadius: '12px', fontWeight: 500, border: '1px solid #444' },
  statusSuccess: { backgroundColor: '#064e3b', color: '#6ee7b7', borderColor: '#059669' },
  downloadBtn: { backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' },
  debugBtn: { backgroundColor: '#333', color: '#aaa', border: '1px solid #444', padding: '8px 12px', borderRadius: '6px', fontWeight: 500, cursor: 'pointer', fontSize: '0.85rem' },
  workspace: { flex: 1, display: 'flex', overflow: 'hidden' },
  sidebar: { width: '320px', flexShrink: 0, backgroundColor: '#181818', borderRight: '1px solid #333', overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' },
  panel: { display: 'flex', flexDirection: 'column', gap: '15px' },
  panelTitle: { fontSize: '0.75rem', textTransform: 'uppercase', color: '#666', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '5px' },
  disabled: { opacity: 0.4, pointerEvents: 'none' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '0.85rem', color: '#ccc', fontWeight: 500 },
  fileInput: { fontSize: '0.8rem', color: '#888', width: '100%' },
  helperText: { fontSize: '0.7rem', color: '#555', margin: 0, fontStyle: 'italic' },
  controlRow: { marginBottom: '10px' },
  rowHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '6px' },
  value: { fontSize: '0.8rem', color: '#3b82f6', fontFamily: 'monospace' },
  tagAi: { fontSize: '0.65rem', color: '#a78bfa', backgroundColor: '#4c1d95', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' },
  slider: { width: '100%', height: '4px', backgroundColor: '#333', borderRadius: '2px', accentColor: '#3b82f6', cursor: 'pointer' },
  actionBtn: { width: '100%', padding: '8px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, marginTop: '5px' },
  btnPrimary: { backgroundColor: '#3b82f6', color: 'white' },
  btnOutline: { backgroundColor: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6' },
  main: { flex: 1, backgroundColor: '#0f0f0f', backgroundImage: 'radial-gradient(#1a1a1a 1px, transparent 1px)', backgroundSize: '20px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overflow: 'hidden', cursor: 'grab' },
  canvasWrapper: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  canvas: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', boxShadow: '0 0 40px rgba(0,0,0,0.5)', borderRadius: '4px' },
  emptyState: { textAlign: 'center', opacity: 0.6 },
  emptyIcon: { fontSize: '3rem', marginBottom: '10px' },
};

export default ShadowCompositor;