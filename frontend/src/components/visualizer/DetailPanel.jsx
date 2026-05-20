import T from '../../theme';
import { getCompTheme } from './compThemes';

const readVersion = (spec) => (typeof spec === 'string' ? spec : (spec?.version || ''));

export default function DetailPanel({ recipe, helmVersion, allRecipes, onClose }) {
  if (!recipe) return null;
  const comps = recipe.components ? Object.entries(recipe.components) : [];
  const fromPaths = recipe.upgradePaths || [];
  const toPaths = allRecipes.filter((r) => r.upgradePaths?.includes(recipe.version)).map((r) => r.version);

  return (
    <div style={{
      width: 340, background: T.bgCard, borderLeft: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
      boxShadow: '-10px 0 30px rgba(0,0,0,0.3)',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '16px 20px', borderBottom: `1px solid ${T.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      }}>
        <div>
          <div style={{ fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Recipe Details
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.teal }}>v{recipe.version}</div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{recipe.description}</div>
        </div>
        <button onClick={onClose} style={{
          background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: 6,
          color: T.textMuted, width: 28, height: 28, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, lineHeight: 1,
        }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {/* Helm version badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 6,
          background: T.bgSurface, border: `1px solid ${T.border}`,
          fontSize: 11, color: T.textMuted, marginBottom: 16,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.teal }} />
          Helm Chart {helmVersion}
        </div>

        {/* Components */}
        <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Components ({comps.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {comps.map(([name, spec], i) => {
            const theme = getCompTheme(name, i);
            const ver = readVersion(spec);

            // Find unique previous versions for this component
            const prevVers = fromPaths.map((pv) => {
              const pr = allRecipes.find((r) => r.version === pv);
              return readVersion(pr?.components?.[name]);
            }).filter((v) => v && v !== ver);
            const uniquePrev = [...new Set(prevVers)];

            // Find unique next versions
            const nextVers = toPaths.map((tv) => {
              const tr = allRecipes.find((r) => r.version === tv);
              return readVersion(tr?.components?.[name]);
            }).filter((v) => v && v !== ver);
            const uniqueNext = [...new Set(nextVers)];

            return (
              <div key={name} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: T.bgSurface, border: `1px solid ${T.border}`,
                borderRadius: 10, padding: '10px 14px',
                borderLeft: `3px solid ${theme.border}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{theme.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, textTransform: 'capitalize' }}>{name}</div>
                    {(uniquePrev.length > 0 || uniqueNext.length > 0) && (
                      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>
                        {uniquePrev.length > 0 && <span>{uniquePrev.join(', ')} → </span>}
                        <span style={{ color: theme.color, fontWeight: 700 }}>{ver}</span>
                        {uniqueNext.length > 0 && <span> → {uniqueNext.join(', ')}</span>}
                      </div>
                    )}
                  </div>
                </div>
                {(!uniquePrev.length && !uniqueNext.length) && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: theme.color,
                    background: theme.bg, padding: '2px 8px', borderRadius: 4,
                  }}>{ver}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Upgrade Paths (From) */}
        <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Upgrade From
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {fromPaths.length > 0 ? fromPaths.map((p) => (
            <div key={p} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: T.bgSurface, border: `1px solid ${T.border}`,
              borderRadius: 8, padding: '8px 14px', fontSize: 13,
            }}>
              <span style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                background: 'rgba(88,166,255,0.1)', color: T.blue,
              }}>v{p}</span>
              <span style={{ color: T.teal, fontSize: 14 }}>→</span>
              <span style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                background: `${T.teal}18`, color: T.teal,
              }}>v{recipe.version}</span>
            </div>
          )) : (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: T.bgSurface, border: `1px solid ${T.border}`,
              fontSize: 12, color: T.textMuted, textAlign: 'center', borderStyle: 'dashed'
            }}>No upgrade source</div>
          )}
        </div>

        {/* Upgrade Paths (To) */}
        <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Upgrade To
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {toPaths.length > 0 ? toPaths.map((p) => (
            <div key={p} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: T.bgSurface, border: `1px solid ${T.border}`,
              borderRadius: 8, padding: '8px 14px', fontSize: 13,
            }}>
              <span style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                background: `${T.teal}18`, color: T.teal,
              }}>v{recipe.version}</span>
              <span style={{ color: T.teal, fontSize: 14 }}>→</span>
              <span style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                background: 'rgba(210,153,34,0.1)', color: T.yellow,
              }}>v{p}</span>
            </div>
          )) : (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: T.bgSurface, border: `1px solid ${T.border}`,
              fontSize: 12, color: T.textMuted, textAlign: 'center', borderStyle: 'dashed'
            }}>Latest version</div>
          )}
        </div>
      </div>
    </div>
  );
}
