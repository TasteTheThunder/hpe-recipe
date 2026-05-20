function normalizeRecipeDescription(text, fallbackVersion) {
  const cleaned = String(text || '').replace(/^\s*description\s*:\s*/i, '').trim();
  if (cleaned) return cleaned;
  return `HPE Ezmeral Runtime ${fallbackVersion}`;
}

function parseUpgradeList(text) {
  if (Array.isArray(text)) {
    return text.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(text || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeVersion(version) {
  return String(version || '').trim().replace(/^v/i, '');
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

export {
  normalizeRecipeDescription,
  parseUpgradeList,
  normalizeVersion,
  getEffectiveUpgradePaths,
};
