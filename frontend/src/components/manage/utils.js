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


function getRecipeUpgradeTo(recipe) {
  const paths = Array.isArray(recipe?.upgrade_to) ? recipe.upgrade_to : [];
  return paths.filter(Boolean);
}

function getRecipeUpgradeFrom(recipes, recipe) {
  if (!recipes || !recipe) return [];
  const targetVersion = recipe.version;
  return recipes
    .filter((r) => Array.isArray(r?.upgrade_to) && r.upgrade_to.includes(targetVersion))
    .map((r) => r.version)
    .filter(Boolean);
}

export {
  normalizeRecipeDescription,
  parseUpgradeList,
  normalizeVersion,
  getRecipeUpgradeTo,
  getRecipeUpgradeFrom,
};
