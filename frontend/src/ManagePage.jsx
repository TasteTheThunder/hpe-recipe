import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import useRealtimeReleases from './useRealtimeReleases';

const API_BASE = '/api';

const T = {
  teal: '#01a982', tealDark: '#007a5e',
  bg: '#0d1117', bgCard: '#161b22', bgSurface: '#1c2333',
  border: '#30363d', text: '#e6edf3', textMuted: '#8b949e',
  white: '#ffffff', red: '#f85149', yellow: '#d29922', blue: '#58a6ff',
  green: '#3fb950',
};

// ============================================================================
// Reusable styled components
// ============================================================================
const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14,
  background: T.bgSurface, color: T.text, border: `1px solid ${T.border}`,
  outline: 'none', boxSizing: 'border-box',
};

const btnPrimary = {
  padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600,
  background: T.teal, color: T.white, border: 'none', cursor: 'pointer',
};

const btnDanger = {
  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  background: 'transparent', color: T.red, border: `1px solid ${T.red}44`,
  cursor: 'pointer',
};

const btnSecondary = {
  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
  background: T.bgSurface, color: T.textMuted, border: `1px solid ${T.border}`,
  cursor: 'pointer',
};

const cardStyle = {
  background: T.bgCard, border: `1px solid ${T.border}`,
  borderRadius: 12, padding: 20, marginBottom: 16,
};

const labelStyle = {
  fontSize: 12, fontWeight: 600, color: T.textMuted,
  textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'block',
};

function normalizeRecipeDescription(text, fallbackVersion) {
  const cleaned = String(text || '').replace(/^\s*description\s*:\s*/i, '').trim();
  if (cleaned) return cleaned;
  return `HPE Ezmeral Runtime ${fallbackVersion}`;
}

function getEffectiveUpgradePaths(recipes, recipe, recipeIndex) {
  const explicit = Array.isArray(recipe.upgradePaths) ? recipe.upgradePaths.filter(Boolean) : [];
  if (explicit.length > 0) return explicit;
  if (recipeIndex > 0) {
    const prevVersion = recipes[recipeIndex - 1]?.version;
    if (prevVersion) return [prevVersion];
  }
  return [];
}

// ============================================================================
// Toast notification
// ============================================================================
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 200,
      padding: '12px 20px', borderRadius: 10,
      background: type === 'error' ? T.red : T.teal,
      color: T.white, fontSize: 14, fontWeight: 600,
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      animation: 'slideIn 0.3s ease',
    }}>
      {message}
      <style>{`@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
}

// ============================================================================
// Create Helm Release Form
// ============================================================================
function CreateReleaseForm({ cluster, onCreated }) {
  const [version, setVersion] = useState('');
  const [releaseName, setReleaseName] = useState('');
  const [draftRecipes, setDraftRecipes] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [expandedRecipeIds, setExpandedRecipeIds] = useState([]);

  const createEmptyRecipe = () => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    version: '',
    description: '',
    components: [
      { name: 'spark', version: '' },
      { name: 'kafka', version: '' },
      { name: 'airflow', version: '' },
      { name: 'hbase', version: '' },
    ],
    upgradePaths: [],
  });

  // Auto-generate release name from version
  const autoReleaseName = version.trim()
    ? `recipe-detection-v${version.trim().replace(/\./g, '-')}`
    : '';

  useEffect(() => {
    if (draftRecipes.length === 0) {
      setDraftRecipes([createEmptyRecipe()]);
    }
  }, [draftRecipes.length]);

  const addRecipeDraft = () => {
    const recipe = createEmptyRecipe();
    setDraftRecipes((prev) => [...prev, recipe]);
    setExpandedRecipeIds((prev) => [...prev, recipe.id]);
  };

  const removeRecipeDraft = (id) => {
    setDraftRecipes((prev) => prev.filter((r) => r.id !== id));
    setExpandedRecipeIds((prev) => prev.filter((rid) => rid !== id));
  };

  const toggleRecipeDraftExpanded = (id) => {
    setExpandedRecipeIds((prev) => (
      prev.includes(id) ? prev.filter((rid) => rid !== id) : [...prev, id]
    ));
  };

  const updateRecipeDraft = (id, field, value) => {
    setDraftRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const updateDraftComponent = (recipeId, index, field, value) => {
    setDraftRecipes((prev) => prev.map((r) => {
      if (r.id !== recipeId) return r;
      const next = [...r.components];
      next[index] = { ...next[index], [field]: value };
      return { ...r, components: next };
    }));
  };

  const addDraftComponent = (recipeId) => {
    setDraftRecipes((prev) => prev.map((r) => (
      r.id === recipeId ? { ...r, components: [...r.components, { name: '', version: '' }] } : r
    )));
  };

  const removeDraftComponent = (recipeId, index) => {
    setDraftRecipes((prev) => prev.map((r) => {
      if (r.id !== recipeId) return r;
      return { ...r, components: r.components.filter((_, i) => i !== index) };
    }));
  };

  const toggleDraftUpgradePath = (recipeId, fromVersion) => {
    setDraftRecipes((prev) => prev.map((r) => {
      if (r.id !== recipeId) return r;
      const exists = r.upgradePaths.includes(fromVersion);
      return {
        ...r,
        upgradePaths: exists ? r.upgradePaths.filter((v) => v !== fromVersion) : [...r.upgradePaths, fromVersion],
      };
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!version.trim()) return;

    const typedDrafts = draftRecipes.filter((r) => r.version.trim());
    if (typedDrafts.length === 0) {
      onCreated('At least one recipe is required', true);
      return;
    }

    const draftVersions = typedDrafts.map((r) => r.version.trim());
    const duplicateVersion = draftVersions.find((v, i) => draftVersions.indexOf(v) !== i);

    if (duplicateVersion) {
      onCreated(`Duplicate recipe version in draft: ${duplicateVersion}`, true);
      return;
    }

    const recipesPayload = [];
    for (let idx = 0; idx < typedDrafts.length; idx += 1) {
      const recipe = typedDrafts[idx];
      const compMap = {};
      recipe.components.forEach((c) => {
        if (c.name.trim() && c.version.trim()) {
          compMap[c.name.trim()] = c.version.trim();
        }
      });

      if (Object.keys(compMap).length === 0) {
        onCreated(`Recipe ${recipe.version.trim()} must have at least one component`, true);
        return;
      }

      const explicitUpgradePaths = recipe.upgradePaths.filter((p) => Boolean(p) && p !== recipe.version.trim());
      const validUpgradePaths = explicitUpgradePaths.length > 0
        ? explicitUpgradePaths
        : (idx > 0 ? [typedDrafts[idx - 1].version.trim()] : []);

      recipesPayload.push({
        version: recipe.version.trim(),
        description: normalizeRecipeDescription(recipe.description, recipe.version.trim()),
        components: compMap,
        upgradePaths: validUpgradePaths,
      });
    }

    setSubmitting(true);
    fetch(`${API_BASE}/helm-releases?cluster=${cluster}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: version.trim(),
        releaseName: releaseName.trim() || autoReleaseName,
        status: 'pending',
        recipes: recipesPayload,
      }),
    })
      .then((r) => {
        if (r.status === 409) throw new Error('Version already exists');
        if (!r.ok) throw new Error('Failed to create');
        return r.json();
      })
      .then(() => {
        setVersion(''); setReleaseName('');
        setDraftRecipes([]);
        setExpandedRecipeIds([]);
        onCreated(`Helm release created with ${recipesPayload.length} recipe${recipesPayload.length > 1 ? 's' : ''}`);
      })
      .catch((err) => onCreated(err.message, true))
      .finally(() => setSubmitting(false));
  };

  return (
    <form onSubmit={handleSubmit} style={cardStyle}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.teal }} />
        New Helm Release
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Chart Version</label>
          <input style={inputStyle} placeholder="e.g. 0.0.4" value={version}
            onChange={(e) => setVersion(e.target.value)} required />
        </div>
        <div>
          <label style={labelStyle}>Release Name (auto-generated if blank)</label>
          <input style={inputStyle} placeholder={autoReleaseName || 'e.g. recipe-detection-v4'}
            value={releaseName} onChange={(e) => setReleaseName(e.target.value)} />
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 8,
          background: `${T.yellow}12`, border: `1px solid ${T.yellow}33`,
          fontSize: 12, color: T.yellow,
        }}>
          <span>⏳</span>
          Status is set automatically — "pending" on creation, "deployed" after Jenkins/Helm deploys successfully
        </div>
      </div>

      <div style={{
        borderRadius: 10,
        padding: 14,
        marginBottom: 16,
        border: `1px solid ${T.blue}55`,
        background: `${T.blue}10`,
      }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.blue }}>
                  Recipes
            </div>
            <button type="button" onClick={addRecipeDraft} style={{ ...btnSecondary, fontSize: 11, padding: '6px 12px' }}>
              + Add Recipe
            </button>
          </div>

          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 12 }}>
                Add at least one recipe version with components. Upgrade paths are optional.
          </div>

              {draftRecipes.length === 0 && (
                <div style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  color: T.textMuted,
                  border: `1px dashed ${T.border}`,
                  background: T.bgCard,
                  marginBottom: 8,
                }}>
                  No recipes added yet. Click + Add Recipe.
                </div>
              )}

          {draftRecipes.map((recipe, recipeIndex) => {
            const upgradeCandidates = draftRecipes
              .slice(0, recipeIndex)
              .filter((r) => r.version.trim())
              .map((r) => r.version.trim());
                const isExpanded = expandedRecipeIds.includes(recipe.id);

            return (
              <div key={recipe.id} style={{
                background: T.bgCard,
                border: `1px solid ${T.border}`,
                borderLeft: `3px solid ${T.blue}`,
                borderRadius: 10,
                padding: 12,
                marginBottom: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <button
                        type="button"
                        onClick={() => toggleRecipeDraftExpanded(recipe.id)}
                        style={{
                          ...btnSecondary,
                          fontSize: 12,
                          padding: '4px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span>{isExpanded ? '▾' : '▸'}</span>
                        <span>{recipe.version.trim() ? `Recipe v${recipe.version.trim()}` : `Recipe #${recipeIndex + 1}`}</span>
                      </button>
                      <button type="button" onClick={() => removeRecipeDraft(recipe.id)} style={{ ...btnDanger, fontSize: 11, padding: '4px 10px' }}>
                        Remove
                      </button>
                </div>

                    {isExpanded && (
                      <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={labelStyle}>Recipe Version</label>
                    <input
                      style={inputStyle}
                      placeholder="e.g. 1.3.1"
                      value={recipe.version}
                      onChange={(e) => updateRecipeDraft(recipe.id, 'version', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Description</label>
                    <input
                      style={inputStyle}
                      placeholder="e.g. Patch release with minor upgrades"
                      value={recipe.description}
                      onChange={(e) => updateRecipeDraft(recipe.id, 'description', e.target.value)}
                    />
                  </div>
                </div>

                <label style={{ ...labelStyle, marginBottom: 8 }}>Components</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  {recipe.components.map((c, i) => (
                    <div key={`${recipe.id}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        style={{ ...inputStyle, flex: 1 }}
                        placeholder="Component name"
                        value={c.name}
                        onChange={(e) => updateDraftComponent(recipe.id, i, 'name', e.target.value)}
                      />
                      <input
                        style={{ ...inputStyle, flex: 1 }}
                        placeholder="Version"
                        value={c.version}
                        onChange={(e) => updateDraftComponent(recipe.id, i, 'version', e.target.value)}
                      />
                      {recipe.components.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeDraftComponent(recipe.id, i)}
                          style={{ ...btnDanger, padding: '6px 10px', fontSize: 14, lineHeight: 1 }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => addDraftComponent(recipe.id)} style={{ ...btnSecondary, alignSelf: 'flex-start', fontSize: 11, padding: '6px 12px' }}>
                    + Add Component
                  </button>
                </div>

                <label style={{ ...labelStyle, marginBottom: 8 }}>Upgrade From</label>
                {upgradeCandidates.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {upgradeCandidates.map((v) => (
                      <button
                        key={`${recipe.id}-${v}`}
                        type="button"
                        onClick={() => toggleDraftUpgradePath(recipe.id, v)}
                        style={{
                          padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: recipe.upgradePaths.includes(v) ? `${T.teal}22` : T.bgSurface,
                          color: recipe.upgradePaths.includes(v) ? T.teal : T.textMuted,
                          border: `1px solid ${recipe.upgradePaths.includes(v) ? T.teal : T.border}`,
                          cursor: 'pointer',
                        }}
                      >
                        v{v}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: T.textMuted }}>
                    Add a previous recipe version first to configure upgrade path.
                  </div>
                )}
                  </>
                )}
              </div>
            );
          })}
      </div>

      <button type="submit" style={{ ...btnPrimary, opacity: submitting ? 0.6 : 1 }} disabled={submitting}>
        {submitting ? 'Creating...' : 'Create Release'}
      </button>
    </form>
  );
}

// ============================================================================
// Helm Release Card (expandable, shows recipes, allows delete)
// ============================================================================
function ReleaseCard({ release, onDeploy, cluster, onRefresh, onNotify }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(null);
  const [editingRecipe, setEditingRecipe] = useState(null);

  useEffect(() => {
    if (expanded) {
      fetch(`${API_BASE}/helm-releases/${release.version}?cluster=${cluster}`)
        .then((r) => r.json())
        .then(setDetail)
        .catch(() => {});
    }
  }, [expanded, release.version, cluster]);

  const handleDeleteRelease = () => {
    if (!window.confirm(`Delete Helm release ${release.version}? This removes all its recipes.`)) return;
    fetch(`${API_BASE}/helm-releases/${release.version}?cluster=${cluster}`, { method: 'DELETE' })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to delete');
        onNotify('Helm release deleted');
        onRefresh();
      })
      .catch((err) => onNotify(err.message, true));
  };

  const handleDeleteRecipe = (recipeVersion) => {
    if (!window.confirm(`Delete recipe ${recipeVersion} from Helm ${release.version}?`)) return;
    fetch(`${API_BASE}/helm-releases/${release.version}/recipes/${recipeVersion}?cluster=${cluster}`, { method: 'DELETE' })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to delete');
        onNotify('Recipe deleted');
        setDetail(null);
        onRefresh();
      })
      .catch((err) => onNotify(err.message, true));
  };

  const handleUpdateRecipe = (recipeVersion, updates) => {
    fetch(`${API_BASE}/helm-releases/${release.version}/recipes/${recipeVersion}?cluster=${cluster}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to update');
        return r.json();
      })
      .then(() => {
        onNotify('Recipe updated');
        setDetail(null);
        setEditingRecipe(null);
        onRefresh();
      })
      .catch((err) => onNotify(err.message, true));
  };

  const recipes = detail?.recipes || [];
  const statusColor = release.status === 'deployed' ? T.green
    : release.status === 'failed' || release.status === 'push_failed' ? T.red
    : release.status === 'deploying' ? T.blue
    : T.yellow;

  const handleDeploy = async () => {
    if (!window.confirm(`Deploy Helm release ${release.version}? This will push to Git and trigger Jenkins.`)) return;
    try {
      await onDeploy(release.version);
    } catch (err) {
      onNotify(err.message || 'Deploy failed', true);
    }
  };

  return (
    <div style={{
      ...cardStyle,
      borderLeft: `3px solid ${statusColor}`,
      transition: 'all 0.2s',
    }}>
      {/* Release header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', flex: 1 }}
          onClick={() => setExpanded(!expanded)}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: `linear-gradient(135deg, ${T.teal}, ${T.tealDark})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, color: T.white, fontWeight: 800,
          }}>
            v{release.version.split('.').pop()}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>
              Helm Chart {release.version}
            </div>
            <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>
              {release.releaseName}
              <span style={{
                marginLeft: 10, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: `${statusColor}18`, color: statusColor,
              }}>{release.status}</span>
            </div>
          </div>
          <span style={{
            marginLeft: 'auto', fontSize: 18, color: T.textMuted,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}>▼</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>
          {release.status !== 'deploying' && (
            <button onClick={handleDeploy} style={{
              ...btnPrimary, padding: '6px 14px', fontSize: 12,
            }}>Deploy</button>
          )}
          {release.status === 'deploying' && (
            <span style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: `${T.blue}18`, color: T.blue, border: `1px solid ${T.blue}44`,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: T.blue,
                animation: 'pulse 1s infinite',
              }} />
              Deploying...
              <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
            </span>
          )}
          <button onClick={handleDeleteRelease} style={btnDanger}>Delete</button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
          {/* Recipes list */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={labelStyle}>Recipes ({recipes.length})</span>
            <span style={{ fontSize: 11, color: T.textMuted }}>
              Add only during release creation
            </span>
          </div>

          {recipes.length === 0 && (
            <div style={{
              padding: '20px', borderRadius: 8, background: T.bgSurface,
              border: `1px dashed ${T.border}`, textAlign: 'center',
              color: T.textMuted, fontSize: 13,
            }}>
              This release has no recipes. Create releases with recipes from the top form.
            </div>
          )}

          {recipes.map((recipe) => (
            (() => {
              const recipeIndex = recipes.findIndex((r) => r.version === recipe.version);
              const effectiveFromPaths = getEffectiveUpgradePaths(recipes, recipe, recipeIndex);
              return (
            <div key={recipe.version} style={{
              background: T.bgSurface, border: `1px solid ${T.border}`,
              borderRadius: 10, padding: 16, marginBottom: 10,
            }}>
              {editingRecipe === recipe.version ? (
                <EditRecipeInline
                  recipe={recipe}
                  allRecipes={recipes}
                  onSave={(updates) => handleUpdateRecipe(recipe.version, updates)}
                  onCancel={() => setEditingRecipe(null)}
                />
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: T.teal }}>
                        Recipe v{recipe.version}
                      </div>
                      <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{normalizeRecipeDescription(recipe.description, recipe.version)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setEditingRecipe(recipe.version)}
                        style={{ ...btnSecondary, padding: '4px 12px', fontSize: 11 }}>Edit</button>
                      <button onClick={() => handleDeleteRecipe(recipe.version)}
                        style={{ ...btnDanger, padding: '4px 12px', fontSize: 11 }}>Delete</button>
                    </div>
                  </div>

                  {/* Components grid */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    {Object.entries(recipe.components || {}).map(([name, ver]) => {
                      const fromPaths = effectiveFromPaths;
                      const toPaths = recipes
                        .filter((r, idx) => getEffectiveUpgradePaths(recipes, r, idx).includes(recipe.version))
                        .map((r) => r.version);
                      
                      const prevVers = fromPaths.map(pv => {
                        const pr = recipes.find(r => r.version === pv);
                        return pr?.components?.[name];
                      }).filter(v => v && v !== ver);
                      const uniquePrev = [...new Set(prevVers)];

                      const nextVers = toPaths.map(tv => {
                        const tr = recipes.find(r => r.version === tv);
                        return tr?.components?.[name];
                      }).filter(v => v && v !== ver);
                      const uniqueNext = [...new Set(nextVers)];

                      return (
                        <div key={name} style={{
                          padding: '6px 12px', borderRadius: 6,
                          background: T.bgCard, border: `1px solid ${T.border}`,
                          fontSize: 12,
                        }}>
                          <span style={{ color: T.textMuted, textTransform: 'capitalize' }}>{name}</span>
                          <span style={{ color: T.teal, fontWeight: 600, marginLeft: 6 }}>
                            {uniquePrev.length > 0 && <span style={{ color: T.textMuted, fontWeight: 400 }}>{uniquePrev.join(', ')} → </span>}
                            {ver}
                            {uniqueNext.length > 0 && <span style={{ color: T.textMuted, fontWeight: 400 }}> → {uniqueNext.join(', ')}</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Upgrade paths info */}
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {effectiveFromPaths.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: T.textMuted }}>Upgrades from:</span>
                        {effectiveFromPaths.map((p) => (
                          <span key={p} style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                            background: `${T.blue}15`, color: T.blue,
                          }}>v{p}</span>
                        ))}
                      </div>
                    )}
                    {recipes.filter((r, idx) => getEffectiveUpgradePaths(recipes, r, idx).includes(recipe.version)).length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: T.textMuted }}>Upgrades to:</span>
                        {recipes.filter((r, idx) => getEffectiveUpgradePaths(recipes, r, idx).includes(recipe.version)).map((p) => (
                          <span key={p.version} style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                            background: `${T.yellow}15`, color: T.yellow,
                          }}>v{p.version}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
              );
            })()
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Inline recipe editor
// ============================================================================
function EditRecipeInline({ recipe, allRecipes, onSave, onCancel }) {
  const [description, setDescription] = useState(recipe.description || '');
  const [components, setComponents] = useState(
    Object.entries(recipe.components || {}).map(([name, version]) => ({ name, version }))
  );
  const [upgradePaths, setUpgradePaths] = useState([...(recipe.upgradePaths || [])]);

  const updateComp = (i, field, val) => {
    const next = [...components];
    next[i] = { ...next[i], [field]: val };
    setComponents(next);
  };

  const addComponent = () => setComponents([...components, { name: '', version: '' }]);
  const removeComponent = (i) => setComponents(components.filter((_, j) => j !== i));

  const toggleUpgrade = (rv) => {
    setUpgradePaths((prev) => prev.includes(rv) ? prev.filter((p) => p !== rv) : [...prev, rv]);
  };

  const handleSave = () => {
    const compMap = {};
    components.forEach((c) => {
      if (c.name.trim() && c.version.trim()) compMap[c.name.trim()] = c.version.trim();
    });
    onSave({
      description: normalizeRecipeDescription(description, recipe.version),
      components: compMap,
      upgradePaths,
    });
  };

  const otherRecipes = allRecipes.filter((r) => r.version !== recipe.version);

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Description</label>
        <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <label style={{ ...labelStyle, marginBottom: 8 }}>Components</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {components.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input style={{ ...inputStyle, flex: 1 }} value={c.name}
              onChange={(e) => updateComp(i, 'name', e.target.value)} placeholder="Component" />
            <input style={{ ...inputStyle, flex: 1 }} value={c.version}
              onChange={(e) => updateComp(i, 'version', e.target.value)} placeholder="Version" />
            <button type="button" onClick={() => removeComponent(i)} style={{ ...btnDanger, padding: '6px 10px' }}>×</button>
          </div>
        ))}
        <button type="button" onClick={addComponent} style={{ ...btnSecondary, alignSelf: 'flex-start', fontSize: 11 }}>
          + Add Component
        </button>
      </div>

      {otherRecipes.length > 0 && (
        <>
          <label style={{ ...labelStyle, marginBottom: 8 }}>Upgrade From</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {otherRecipes.map((r) => (
              <button key={r.version} type="button" onClick={() => toggleUpgrade(r.version)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: upgradePaths.includes(r.version) ? `${T.teal}22` : T.bgCard,
                color: upgradePaths.includes(r.version) ? T.teal : T.textMuted,
                border: `1px solid ${upgradePaths.includes(r.version) ? T.teal : T.border}`,
                cursor: 'pointer',
              }}>v{r.version}</button>
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSave} style={btnPrimary}>Save Changes</button>
        <button onClick={onCancel} style={btnSecondary}>Cancel</button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Manage Page
// ============================================================================
export default function ManagePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCluster = searchParams.get('cluster') === 'prod' ? 'prod' : 'dev';
  const [cluster, setCluster] = useState(initialCluster);
  const { helmReleases: releases, loading, error, lastEvent, refetch } = useRealtimeReleases(cluster);
  const [toast, setToast] = useState(null);

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

  // Show toast on realtime events from other users/Jenkins
  useEffect(() => {
    if (!lastEvent) return;
    const eventLabels = {
      status_changed: `Release ${lastEvent.data?.version} → ${lastEvent.data?.status}`,
      release_created: `New release ${lastEvent.data?.version} created`,
      release_deleted: `Release ${lastEvent.data?.version} deleted`,
      recipe_added: `Recipe added to ${lastEvent.data?.helmVersion}`,
      recipe_updated: `Recipe updated in ${lastEvent.data?.helmVersion}`,
      recipe_deleted: `Recipe removed from ${lastEvent.data?.helmVersion}`,
    };
    const label = eventLabels[lastEvent.event];
    if (label) setToast({ message: label, type: 'success' });
  }, [lastEvent]);

  const notify = (message, isError = false) => {
    setToast({ message, type: isError ? 'error' : 'success' });
  };

  const refresh = () => refetch();

  async function deployRelease(version) {
    const response = await fetch(`${API_BASE}/helm-releases/${version}/deploy?cluster=${cluster}`, {
      method: 'POST',
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const message = payload.error || `Deploy failed for ${version}`;
      notify(message, true);
      window.alert(message);
      throw new Error(message);
    }

    const message = payload.message || `Deploy triggered for ${version} on ${cluster.toUpperCase()}`;
    notify(message);
    window.alert(message);
    refresh();
    return payload;
  }

  return (
    <div style={{
      fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      minHeight: '100vh', background: T.bg, color: T.text,
    }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <header style={{
        background: T.bgCard, borderBottom: `1px solid ${T.border}`,
        padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
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
              Recipe Manager
            </h1>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>
              Create & manage Helm releases and recipes
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select value={cluster} onChange={(e) => setCluster(e.target.value)} style={{
            ...btnSecondary,
            padding: '7px 10px',
          }}>
            <option value="dev">DEV</option>
            <option value="prod">PROD</option>
          </select>
          <span style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: T.textMuted, whiteSpace: 'nowrap' }}>
            Cluster: {cluster.toUpperCase()}
          </span>
          <Link to={`/?cluster=${cluster}`} style={{
            ...btnSecondary, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            ← Visualizer
          </Link>
          <button onClick={refresh} style={btnSecondary}>Refresh</button>
        </div>
      </header>

      {error && (
        <div style={{
          background: `${T.red}15`, color: T.red,
          padding: '10px 24px', fontSize: 13, borderBottom: `1px solid ${T.red}33`,
        }}>{error}</div>
      )}

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
        {/* Create new release */}
        <CreateReleaseForm onCreated={(msg, isError) => {
          notify(msg, isError);
          if (!isError) refresh();
        }} cluster={cluster} />

        {/* Existing releases */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, marginTop: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>
            Helm Releases
          </h2>
          <span style={{
            padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            background: `${T.teal}18`, color: T.teal,
          }}>{releases.length}</span>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: T.textMuted }}>Loading...</div>
        )}

        {!loading && releases.length === 0 && (
          <div style={{
            ...cardStyle, textAlign: 'center', padding: 40,
            border: `1px dashed ${T.border}`,
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 6 }}>No releases yet</div>
            <div style={{ fontSize: 13, color: T.textMuted }}>Create your first Helm release above to get started.</div>
          </div>
        )}

        {!loading && releases.map((r) => (
          <ReleaseCard
            key={r.version}
            release={r}
            cluster={cluster}
            onRefresh={refresh}
            onNotify={notify}
            onDeploy={deployRelease}
          />
        ))}
      </div>
    </div>
  );
}