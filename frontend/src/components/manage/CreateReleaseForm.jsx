import { useState, useEffect } from 'react';
import T from '../../theme';
import {
  inputStyle,
  btnPrimary,
  btnDanger,
  btnSecondary,
  cardStyle,
  labelStyle,
} from '../../ui/styles';
import { normalizeRecipeDescription } from './utils';

const API_BASE = '/api';

export default function CreateReleaseForm({ cluster, onCreated }) {
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
