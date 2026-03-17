package com.hpe.recipe.service;

import com.hpe.recipe.model.HelmRelease;
import com.hpe.recipe.model.Recipe;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class HelmReleaseService {

    private final List<HelmRelease> helmReleases;

    public HelmReleaseService() {
        this.helmReleases = new ArrayList<>(buildHelmReleases());
    }

    public List<HelmRelease> getAllHelmReleases() {
        return helmReleases;
    }

    public HelmRelease getHelmRelease(String version) {
        return helmReleases.stream()
                .filter(h -> h.getVersion().equals(version))
                .findFirst()
                .orElse(null);
    }

    public HelmRelease createHelmRelease(HelmRelease release) {
        // Don't allow duplicate versions
        if (getHelmRelease(release.getVersion()) != null) {
            return null;
        }
        if (release.getRecipes() == null) {
            release.setRecipes(new ArrayList<>());
        } else {
            release.setRecipes(new ArrayList<>(release.getRecipes()));
        }
        if (release.getStatus() == null || release.getStatus().isEmpty()) {
            release.setStatus("pending");
        }
        helmReleases.add(release);
        return release;
    }

    public HelmRelease updateHelmRelease(String version, HelmRelease updated) {
        HelmRelease existing = getHelmRelease(version);
        if (existing == null) return null;

        if (updated.getReleaseName() != null) existing.setReleaseName(updated.getReleaseName());
        if (updated.getStatus() != null) existing.setStatus(updated.getStatus());
        if (updated.getRecipes() != null) existing.setRecipes(new ArrayList<>(updated.getRecipes()));
        return existing;
    }

    public boolean deleteHelmRelease(String version) {
        return helmReleases.removeIf(h -> h.getVersion().equals(version));
    }

    // Recipe CRUD within a helm release
    public Recipe addRecipeToRelease(String helmVersion, Recipe recipe) {
        HelmRelease release = getHelmRelease(helmVersion);
        if (release == null) return null;

        // Don't allow duplicate recipe versions within a release
        boolean exists = release.getRecipes().stream()
                .anyMatch(r -> r.getVersion().equals(recipe.getVersion()));
        if (exists) return null;

        if (recipe.getComponents() == null) recipe.setComponents(new LinkedHashMap<>());
        if (recipe.getUpgradePaths() == null) recipe.setUpgradePaths(new ArrayList<>());
        release.getRecipes().add(recipe);
        return recipe;
    }

    public Recipe updateRecipeInRelease(String helmVersion, String recipeVersion, Recipe updated) {
        HelmRelease release = getHelmRelease(helmVersion);
        if (release == null) return null;

        Recipe existing = release.getRecipes().stream()
                .filter(r -> r.getVersion().equals(recipeVersion))
                .findFirst().orElse(null);
        if (existing == null) return null;

        if (updated.getDescription() != null) existing.setDescription(updated.getDescription());
        if (updated.getComponents() != null) existing.setComponents(new LinkedHashMap<>(updated.getComponents()));
        if (updated.getUpgradePaths() != null) existing.setUpgradePaths(new ArrayList<>(updated.getUpgradePaths()));
        return existing;
    }

    public boolean deleteRecipeFromRelease(String helmVersion, String recipeVersion) {
        HelmRelease release = getHelmRelease(helmVersion);
        if (release == null) return false;
        return release.getRecipes().removeIf(r -> r.getVersion().equals(recipeVersion));
    }

    public List<Recipe> getRecipesByHelmVersion(String version) {
        HelmRelease release = getHelmRelease(version);
        if (release == null) {
            return Collections.emptyList();
        }
        return release.getRecipes();
    }

    public Map<String, String> getComponentsByRecipe(String helmVersion, String recipeVersion) {
        List<Recipe> recipes = getRecipesByHelmVersion(helmVersion);
        return recipes.stream()
                .filter(r -> r.getVersion().equals(recipeVersion))
                .findFirst()
                .map(Recipe::getComponents)
                .orElse(Collections.emptyMap());
    }

    public List<String> getUpgradePaths(String helmVersion, String recipeVersion) {
        List<Recipe> recipes = getRecipesByHelmVersion(helmVersion);
        return recipes.stream()
                .filter(r -> r.getVersion().equals(recipeVersion))
                .findFirst()
                .map(Recipe::getUpgradePaths)
                .orElse(Collections.emptyList());
    }

    public Map<String, Object> getUpgradePathsBetweenHelmVersions(String fromVersion, String toVersion) {
        HelmRelease fromRelease = getHelmRelease(fromVersion);
        HelmRelease toRelease = getHelmRelease(toVersion);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("fromHelmVersion", fromVersion);
        result.put("toHelmVersion", toVersion);

        if (fromRelease == null || toRelease == null) {
            result.put("error", "One or both helm versions not found");
            return result;
        }

        List<String> fromRecipeVersions = fromRelease.getRecipes().stream()
                .map(Recipe::getVersion).toList();
        List<String> toRecipeVersions = toRelease.getRecipes().stream()
                .map(Recipe::getVersion).toList();

        List<String> removedRecipes = fromRecipeVersions.stream()
                .filter(v -> !toRecipeVersions.contains(v)).toList();
        List<String> addedRecipes = toRecipeVersions.stream()
                .filter(v -> !fromRecipeVersions.contains(v)).toList();

        Map<String, Object> recipeChanges = new LinkedHashMap<>();
        recipeChanges.put("removed", removedRecipes);
        recipeChanges.put("added", addedRecipes);
        result.put("recipeChanges", recipeChanges);

        Recipe latestFrom = fromRelease.getRecipes().get(fromRelease.getRecipes().size() - 1);
        Recipe latestTo = toRelease.getRecipes().get(toRelease.getRecipes().size() - 1);

        Map<String, Map<String, String>> componentDiffs = new LinkedHashMap<>();
        Set<String> allComponents = new TreeSet<>();
        allComponents.addAll(latestFrom.getComponents().keySet());
        allComponents.addAll(latestTo.getComponents().keySet());

        for (String component : allComponents) {
            String fromVer = latestFrom.getComponents().getOrDefault(component, "N/A");
            String toVer = latestTo.getComponents().getOrDefault(component, "N/A");
            if (!fromVer.equals(toVer)) {
                Map<String, String> diff = new LinkedHashMap<>();
                diff.put("from", fromVer);
                diff.put("to", toVer);
                componentDiffs.put(component, diff);
            }
        }
        result.put("componentVersionDiffs", componentDiffs);

        return result;
    }

    private List<HelmRelease> buildHelmReleases() {
        Recipe r130 = new Recipe("1.3.0", "HPE Ezmeral Runtime 1.3.0",
                new LinkedHashMap<>(Map.of("spark", "3.1.2", "kafka", "3.1.0", "airflow", "2.3.0", "hbase", "2.4.6")),
                new ArrayList<>());

        Recipe r131 = new Recipe("1.3.1", "HPE Ezmeral Runtime 1.3.1",
                new LinkedHashMap<>(Map.of("spark", "3.2.0", "kafka", "3.2.1", "airflow", "2.4.1", "hbase", "2.4.8")),
                new ArrayList<>(List.of("1.3.0")));

        HelmRelease v001 = new HelmRelease("0.0.1", "recipe-detection-v1", "deployed",
                new ArrayList<>(List.of(r130, r131)));

        Recipe r132 = new Recipe("1.3.2", "HPE Ezmeral Runtime 1.3.2",
                new LinkedHashMap<>(Map.of("spark", "3.2.1", "kafka", "3.2.3", "airflow", "2.4.3", "hbase", "2.4.9")),
                new ArrayList<>(List.of("1.3.1", "1.3.0")));

        Recipe r140 = new Recipe("1.4.0", "HPE Ezmeral Runtime 1.4.0",
                new LinkedHashMap<>(Map.of("spark", "3.3.0", "kafka", "3.3.2", "airflow", "2.5.3", "hbase", "2.5.4")),
                new ArrayList<>(List.of("1.3.2", "1.3.1")));

        HelmRelease v002 = new HelmRelease("0.0.2", "recipe-detection-v2", "deployed",
                new ArrayList<>(List.of(r132, r140)));

        Recipe r141 = new Recipe("1.4.1", "HPE Ezmeral Runtime 1.4.1",
                new LinkedHashMap<>(Map.of("spark", "3.3.1", "kafka", "3.4.0", "airflow", "2.6.3", "hbase", "2.5.5")),
                new ArrayList<>(List.of("1.4.0", "1.3.2")));

        Recipe r150 = new Recipe("1.5.0", "HPE Ezmeral Runtime 1.5.0",
                new LinkedHashMap<>(Map.of("spark", "3.4.0", "kafka", "3.5.0", "airflow", "2.7.0", "hbase", "2.6.0")),
                new ArrayList<>(List.of("1.4.1", "1.4.0")));

        HelmRelease v003 = new HelmRelease("0.0.3", "recipe-detection-v3", "deployed",
                new ArrayList<>(List.of(r141, r150)));

        return new ArrayList<>(List.of(v001, v002, v003));
    }
}
