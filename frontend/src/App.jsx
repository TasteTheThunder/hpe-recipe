import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import useRealtimeReleases from './useRealtimeReleases';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';

const API_BASE = '/api';

// ============================================================================
// Theme
// ============================================================================
const T = {
  teal: '#01a982',
  tealDark: '#007a5e',
  tealLight: '#e6f9f4',
  bg: '#0d1117',
  bgCard: '#161b22',
  bgSurface: '#1c2333',
  border: '#30363d',
  text: '#e6edf3',
  textMuted: '#8b949e',
  textDim: '#484f58',
  accent: '#01a982',
  white: '#ffffff',
  red: '#f85149',
  yellow: '#d29922',
  blue: '#58a6ff',
};

const COMP_THEMES = [
  { bg: '#1a2744', border: '#58a6ff', icon: '⚡', color: '#79c0ff' }, // spark
  { bg: '#2a1f1a', border: '#d29922', icon: '📨', color: '#e3b341' }, // kafka
  { bg: '#1a2a2a', border: '#3fb950', icon: '🌊', color: '#56d364' }, // airflow
  { bg: '#2a1a2a', border: '#bc8cff', icon: '🗄️', color: '#d2a8ff' }, // hbase
  { bg: '#2a2a1a', border: '#d29922', icon: '📦', color: '#e3b341' }, // fallback
];

function getCompTheme(name, idx) {
  const map = { spark: 0, kafka: 1, airflow: 2, hbase: 3 };
  return COMP_THEMES[map[name.toLowerCase()] ?? idx % COMP_THEMES.length];
}

// ============================================================================
// Dagre auto‑layout
// ============================================================================
function layoutGraph(nodes, edges, direction = 'LR') {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: 120, nodesep: 60, edgesep: 30 });

  nodes.forEach((n) => {
    const w = n.type === 'component' ? 180 : 220;
    const h = n.type === 'component' ? 60 : 90;
    g.setNode(n.id, { width: w, height: h });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    const w = n.type === 'component' ? 180 : 220;
    const h = n.type === 'component' ? 60 : 90;
    return { ...n, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });
}

// ============================================================================
// Custom Nodes
// ============================================================================
function RecipeNode({ data }) {
  const sel = data.isSelected;
  return (
    <div style={{
      background: sel ? `linear-gradient(135deg, ${T.teal}, ${T.tealDark})` : T.bgCard,
      border: `2px solid ${sel ? T.white + '44' : T.border}`,
      borderRadius: 16,
      padding: '16px 24px',
      minWidth: 220,
      cursor: 'pointer',
      backdropFilter: 'blur(10px)',
      boxShadow: sel 
        ? `0 0 30px ${T.teal}88, 0 0 60px ${T.teal}33, inset 0 0 10px rgba(255,255,255,0.2)` 
        : '0 8px 32px rgba(0,0,0,0.4)',
      transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      transform: sel ? 'scale(1.05)' : 'scale(1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: sel ? 'rgba(255,255,255,0.25)' : T.bgSurface,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
        }}>📋</div>
        <div style={{
          fontWeight: 800, fontSize: 16,
          color: sel ? T.white : T.teal,
          letterSpacing: 0.5,
        }}>v{data.version}</div>
      </div>
      <div style={{
        fontSize: 12, color: sel ? 'rgba(255,255,255,0.9)' : T.textMuted,
        lineHeight: 1.5, fontWeight: 400,
      }}>{data.description}</div>
      
      {sel && (
        <div style={{
          marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.1)',
          fontSize: 10, color: 'rgba(255,255,255,0.7)',
          display: 'flex', alignItems: 'center', gap: 6,
          textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.white, display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
          Active Recipe
        </div>
      )}
      <style>{`@keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.2); } 100% { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );
}

function ComponentNode({ data }) {
  const theme = data.theme;
  return (
    <div style={{
      background: `linear-gradient(135deg, ${theme.bg}, ${theme.bg}dd)`,
      border: `1.5px solid ${theme.border}88`,
      borderRadius: 12,
      padding: '12px 18px',
      minWidth: 170,
      boxShadow: `0 4px 15px rgba(0,0,0,0.3), 0 0 10px ${theme.border}22`,
      transition: 'all 0.3s ease',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: `${theme.color}15`, border: `1px solid ${theme.border}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18,
      }}>{theme.icon}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: theme.color, textTransform: 'capitalize', letterSpacing: 0.2 }}>{data.name}</div>
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, fontWeight: 500 }}>v{data.version}</div>
      </div>
    </div>
  );
}

const nodeTypes = { recipe: RecipeNode, component: ComponentNode };

// ============================================================================
// Build graph
// ============================================================================
function buildGraph(recipes, selectedRecipeVersion) {
  const nodes = [];
  const edges = [];
  if (!recipes?.length) return { nodes, edges };

  recipes.forEach((recipe) => {
    const sel = recipe.version === selectedRecipeVersion;
    nodes.push({
      id: `recipe-${recipe.version}`,
      type: 'recipe',
      position: { x: 0, y: 0 },
      data: { version: recipe.version, description: recipe.description, isSelected: sel },
    });
  });

  // Upgrade edges
  recipes.forEach((recipe) => {
    (recipe.upgradePaths || []).forEach((from) => {
      if (recipes.some((r) => r.version === from)) {
        edges.push({
          id: `upgrade-${from}-${recipe.version}`,
          source: `recipe-${from}`,
          target: `recipe-${recipe.version}`,
          type: 'smoothstep',
          animated: true,
          label: 'upgrades to',
          labelStyle: { fontSize: 10, fill: T.white, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
          labelBgStyle: { fill: T.teal, fillOpacity: 0.9 },
          labelBgPadding: [10, 5],
          labelBgBorderRadius: 6,
          style: { stroke: T.teal, strokeWidth: 4, opacity: 0.8 },
          markerEnd: { type: MarkerType.ArrowClosed, color: T.teal, width: 28, height: 28 },
        });
      }
    });
  });

  // Component nodes for selected recipe
  if (selectedRecipeVersion) {
    const sel = recipes.find((r) => r.version === selectedRecipeVersion);
    if (sel?.components) {
      Object.entries(sel.components).forEach(([name, ver], i) => {
        const theme = getCompTheme(name, i);
        const nid = `comp-${selectedRecipeVersion}-${name}`;
        nodes.push({
          id: nid, type: 'component', position: { x: 0, y: 0 },
          data: { name, version: ver, theme },
        });
        edges.push({
          id: `edge-${selectedRecipeVersion}-${name}`,
          source: `recipe-${selectedRecipeVersion}`,
          target: nid,
          type: 'smoothstep',
          style: { stroke: theme.border, strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: theme.border, width: 12, height: 12 },
        });
      });
    }
  }

  const laid = layoutGraph(nodes, edges, 'LR');
  return { nodes: laid, edges };
}

// ============================================================================
// Version Timeline selector
// ============================================================================
function VersionTimeline({ releases, selected, onSelect }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {releases.map((hr, i) => {
        const active = hr.version === selected;
        return (
          <React.Fragment key={hr.version}>
            {i > 0 && (
              <div style={{
                width: 40, height: 2,
                background: i <= releases.findIndex((r) => r.version === selected)
                  ? T.teal : T.border,
                transition: 'background 0.3s',
              }} />
            )}
            <button
              onClick={() => onSelect(hr.version)}
              title={`${hr.version} — ${hr.releaseName}`}
              style={{
                width: 40, height: 40, borderRadius: '50%',
                border: `2px solid ${active ? T.teal : T.border}`,
                background: active ? T.teal : T.bgSurface,
                color: active ? T.white : T.textMuted,
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.25s ease',
                boxShadow: active ? `0 0 12px ${T.teal}66` : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              v{hr.version.split('.').pop()}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ============================================================================
// Detail Panel
// ============================================================================
function DetailPanel({ recipe, helmVersion, allRecipes, onClose }) {
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
          {comps.map(([name, ver], i) => {
            const theme = getCompTheme(name, i);
            
            // Find unique previous versions for this component
            const prevVers = fromPaths.map(pv => {
              const pr = allRecipes.find(r => r.version === pv);
              return pr?.components?.[name];
            }).filter(v => v && v !== ver);
            const uniquePrev = [...new Set(prevVers)];

            // Find unique next versions
            const nextVers = toPaths.map(tv => {
              const tr = allRecipes.find(r => r.version === tv);
              return tr?.components?.[name];
            }).filter(v => v && v !== ver);
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

// ============================================================================
// Comparison Modal
// ============================================================================
function CompareView({ releases, currentVersion, cluster, onClose }) {
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

// ============================================================================
// Stats bar
// ============================================================================
function StatsBar({ release }) {
  if (!release) return null;
  const recipeCount = release.recipes?.length || 0;
  const compCount = release.recipes?.reduce((s, r) => s + Object.keys(r.components || {}).length, 0) || 0;
  const pathCount = release.recipes?.reduce((s, r) => s + (r.upgradePaths?.length || 0), 0) || 0;

  const stats = [
    { label: 'Recipes', value: recipeCount, color: T.teal },
    { label: 'Components', value: compCount, color: T.blue },
    { label: 'Upgrade Paths', value: pathCount, color: T.yellow },
    { label: 'Status', value: release.status, color: release.status === 'deployed' ? T.teal : T.red },
  ];

  return (
    <div style={{
      display: 'flex', gap: 12, padding: '12px 24px',
      background: T.bgCard, borderBottom: `1px solid ${T.border}`,
    }}>
      {stats.map((s) => (
        <div key={s.label} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 14px', borderRadius: 8,
          background: T.bgSurface, border: `1px solid ${T.border}`,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
          <span style={{ fontSize: 12, color: T.textMuted }}>{s.label}:</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main App
// ============================================================================
export default function App() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCluster = searchParams.get('cluster') === 'prod' ? 'prod' : 'dev';
  const [cluster, setCluster] = useState(initialCluster);
  const { helmReleases, loading: releasesLoading, error: releasesError } = useRealtimeReleases(cluster);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [releaseDetail, setReleaseDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRecipeVersion, setSelectedRecipeVersion] = useState(null);
  const [showCompare, setShowCompare] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const loading = releasesLoading || detailLoading;

  useEffect(() => {
    const urlCluster = searchParams.get('cluster') === 'prod' ? 'prod' : 'dev';
    setCluster((prev) => (prev === urlCluster ? prev : urlCluster));
  }, [searchParams]);

  useEffect(() => {
    const urlCluster = searchParams.get('cluster') === 'prod' ? 'prod' : 'dev';
    if (urlCluster !== cluster) {
      const next = new URLSearchParams(searchParams);
      next.set('cluster', cluster);
      setSearchParams(next, { replace: true });
    }
  }, [cluster, searchParams, setSearchParams]);

  // Sync error from realtime hook
  useEffect(() => {
    if (releasesError) setError(releasesError);
  }, [releasesError]);

  // Fetch detail when version selected
  useEffect(() => {
    if (!selectedVersion) {
      setReleaseDetail(null); setSelectedRecipeVersion(null);
      setNodes([]); setEdges([]); setError(null); return;
    }

    // Wait until releases for the current cluster are loaded, then validate selection.
    if (releasesLoading) return;

    const existsInCluster = helmReleases.some((r) => r.version === selectedVersion);
    if (!existsInCluster) {
      setSelectedVersion('');
      setReleaseDetail(null);
      setSelectedRecipeVersion(null);
      setNodes([]);
      setEdges([]);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setDetailLoading(true); setError(null); setSelectedRecipeVersion(null);
    fetch(`${API_BASE}/helm-releases/${selectedVersion}?cluster=${cluster}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        setReleaseDetail(data);
        const { nodes: n, edges: e } = buildGraph(data.recipes || [], null);
        setNodes(n); setEdges(e);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setError(`Failed to load version ${selectedVersion}`);
        setReleaseDetail(null);
      })
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [selectedVersion, cluster, releasesLoading, helmReleases, setNodes, setEdges]);

  // Rebuild graph on recipe selection
  useEffect(() => {
    if (!releaseDetail) return;
    const { nodes: n, edges: e } = buildGraph(releaseDetail.recipes || [], selectedRecipeVersion);
    setNodes(n); setEdges(e);
  }, [selectedRecipeVersion, releaseDetail, setNodes, setEdges]);

  const onNodeClick = useCallback((_ev, node) => {
    if (node.type === 'recipe') {
      setSelectedRecipeVersion((prev) => (prev === node.data.version ? null : node.data.version));
    }
  }, []);

  const selectedRecipeObj = useMemo(() => {
    if (!releaseDetail || !selectedRecipeVersion) return null;
    return (releaseDetail.recipes || []).find((r) => r.version === selectedRecipeVersion);
  }, [releaseDetail, selectedRecipeVersion]);

  return (
    <div style={{
      fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: T.bg, color: T.text,
    }}>
      {/* Header */}
      <header style={{
        background: T.bgCard, borderBottom: `1px solid ${T.border}`,
        padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${T.teal}, ${T.tealDark})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, color: T.white, fontWeight: 800,
          }}>H</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.text, letterSpacing: -0.3 }}>
              HPE Recipe Detection
            </h1>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>
              Helm Chart Version Visualizer
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <select value={cluster} onChange={(e) => setCluster(e.target.value)} style={{
            padding: '7px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: T.bgSurface, color: T.text, border: `1px solid ${T.border}`,
            cursor: 'pointer',
          }}>
            <option value="dev">DEV</option>
            <option value="prod">PROD</option>
          </select>
          <span style={{ fontSize: 12, color: T.textMuted, whiteSpace: 'nowrap' }}>
            Cluster: {cluster.toUpperCase()}
          </span>
          <VersionTimeline
            releases={helmReleases}
            selected={selectedVersion}
            onSelect={setSelectedVersion}
          />
          {selectedVersion && (
            <button onClick={() => setShowCompare(true)} style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: T.bgSurface, border: `1px solid ${T.border}`,
              color: T.textMuted, cursor: 'pointer', transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}>Compare</button>
          )}
          <Link to={`/manage?cluster=${cluster}`} style={{
            padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: T.teal, color: T.white, textDecoration: 'none',
            cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>+ Manage</Link>
        </div>
      </header>

      {/* Stats bar */}
      <StatsBar release={releaseDetail} />

      {/* Error / loading */}
      {error && (
        <div style={{
          background: `${T.red}15`, color: T.red,
          padding: '10px 24px', fontSize: 13, borderBottom: `1px solid ${T.red}33`,
        }}>{error}</div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          {!selectedVersion && !loading && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)', textAlign: 'center',
            }}>
              <div style={{
                width: 80, height: 80, borderRadius: 20, margin: '0 auto 20px',
                background: T.bgCard, border: `1px solid ${T.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 36,
              }}>📊</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: T.text, marginBottom: 8 }}>
                Select a Helm Release
              </div>
              <div style={{ fontSize: 14, color: T.textMuted, maxWidth: 360, lineHeight: 1.6 }}>
                Choose a version from the timeline above to visualize recipes, components, and upgrade paths.
              </div>
              {helmReleases.length > 0 && (
                <button onClick={() => setSelectedVersion(helmReleases[helmReleases.length - 1].version)} style={{
                  marginTop: 20, padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                  background: T.teal, color: T.white, border: 'none', cursor: 'pointer',
                  boxShadow: `0 4px 14px ${T.teal}44`,
                }}>View Latest Version</button>
              )}
            </div>
          )}

          {loading && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)', textAlign: 'center',
              color: T.textMuted, fontSize: 14,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                border: `3px solid ${T.border}`, borderTopColor: T.teal,
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 12px',
              }} />
              Loading...
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {selectedVersion && releaseDetail && !loading && (
            <ReactFlow
              nodes={nodes} edges={edges}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              fitView fitViewOptions={{ padding: 0.35 }}
              minZoom={0.3} maxZoom={2}
              proOptions={{ hideAttribution: true }}
              style={{ background: T.bg }}
            >
              <Background color={T.textDim} gap={24} size={1} />
              <Controls
                style={{
                  bottom: 16, left: 16, borderRadius: 10, overflow: 'hidden',
                  border: `1px solid ${T.border}`, background: T.bgCard,
                }}
                showInteractive={false}
              />
              <MiniMap
                nodeColor={(n) => n.type === 'recipe' ? T.teal : (n.data?.theme?.border || T.textDim)}
                maskColor="rgba(13,17,23,0.8)"
                style={{ bottom: 16, right: 16, borderRadius: 10, border: `1px solid ${T.border}`, background: T.bgCard }}
              />
            </ReactFlow>
          )}

          {/* Click hint */}
          {selectedVersion && releaseDetail && !selectedRecipeVersion && !loading && (
            <div style={{
              position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
              padding: '8px 18px', borderRadius: 20,
              background: T.bgCard, border: `1px solid ${T.border}`,
              fontSize: 12, color: T.textMuted,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}>
              Click a recipe node to expand its components
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedRecipeObj && (
          <DetailPanel
            recipe={selectedRecipeObj}
            helmVersion={selectedVersion}
            allRecipes={releaseDetail.recipes || []}
            onClose={() => setSelectedRecipeVersion(null)}
          />
        )}
      </div>

      {/* Compare modal */}
      {showCompare && (
        <CompareView
          releases={helmReleases}
          currentVersion={selectedVersion}
          cluster={cluster}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  );
}