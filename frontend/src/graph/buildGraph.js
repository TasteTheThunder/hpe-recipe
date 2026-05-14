import { MarkerType } from 'reactflow';
import T from '../theme';
import layoutGraph from './layoutGraph';
import { getCompTheme } from '../components/visualizer/compThemes';

export default function buildGraph(recipes, selectedRecipeVersion) {
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
          style: { stroke: T.teal, strokeWidth: 3, opacity: 0.8 },
          markerEnd: { type: MarkerType.ArrowClosed, color: T.teal, width: 14, height: 20 },
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
          markerEnd: { type: MarkerType.ArrowClosed, color: theme.border, width: 14, height: 14 },
        });
      });
    }
  }

  const laid = layoutGraph(nodes, edges, 'LR');
  return { nodes: laid, edges };
}
