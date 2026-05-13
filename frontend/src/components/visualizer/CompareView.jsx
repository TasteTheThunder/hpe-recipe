import { useState, useEffect } from 'react';
import T from '../../theme';

const API_BASE = '/api';

export default function CompareView({ releases, currentVersion, cluster, onClose }) {
  const [compareWith, setCompareWith] = useState('');
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(false);

  const others = releases.filter((r) => r.version !== currentVersion);

  useEffect(() => {
    if (!compareWith) { setDiff(null); return; }
    setLoading(true);
    fetch(`${API_BASE}/helm-releases/compare?from=${compareWith}&to=${currentVersion}&cluster=${cluster}`)
      .then((r) => r.json())
      .then(setDiff)
      .catch(() => setDiff(null))
      .finally(() => setLoading(false));
  }, [compareWith, currentVersion, cluster]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16,
        padding: 28, width: 560, maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: T.text }}>Compare Helm Versions</h2>
          <button onClick={onClose} style={{
            background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: 6,
            color: T.textMuted, width: 28, height: 28, cursor: 'pointer', fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <select value={compareWith} onChange={(e) => setCompareWith(e.target.value)} style={{
            flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 14,
            background: T.bgSurface, color: T.text, border: `1px solid ${T.border}`,
          }}>
            <option value="">Select version to compare...</option>
            {others.map((r) => <option key={r.version} value={r.version}>{r.version} ({r.releaseName})</option>)}
          </select>
          <span style={{ color: T.textMuted, fontSize: 14 }}>→</span>
          <div style={{
            padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            background: `${T.teal}18`, color: T.teal, border: `1px solid ${T.teal}44`,
          }}>{currentVersion}</div>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 20, color: T.textMuted }}>Loading comparison...</div>}

        {diff && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(diff).map(([key, val]) => (
              <div key={key} style={{
                background: T.bgSurface, border: `1px solid ${T.border}`,
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 6, textTransform: 'capitalize' }}>
                  {key.replace(/([A-Z])/g, ' $1')}
                </div>
                <pre style={{
                  margin: 0, fontSize: 12, color: T.textMuted, whiteSpace: 'pre-wrap',
                  fontFamily: "'SF Mono', 'Fira Code', monospace",
                }}>{typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
