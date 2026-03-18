package com.hpe.recipe.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hpe.recipe.model.HelmRelease;
import com.hpe.recipe.model.Recipe;
import io.fabric8.kubernetes.api.model.ConfigMap;
import io.fabric8.kubernetes.client.KubernetesClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class HelmReleaseService {

    private static final Logger log = LoggerFactory.getLogger(HelmReleaseService.class);
    private static final String LABEL_APP_NAME = "app.kubernetes.io/name";
    private static final String LABEL_APP_VERSION = "app.kubernetes.io/version";
    private static final String ANNOTATION_RELEASE_NAME = "meta.helm.sh/release-name";
    private static final String RECIPE_DATA_KEY = "recipe-data.json";

    private final KubernetesClient kubernetesClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public HelmReleaseService(KubernetesClient kubernetesClient) {
        this.kubernetesClient = kubernetesClient;
    }

    private List<ConfigMap> fetchRecipeConfigMaps() {
        return kubernetesClient.configMaps()
                .inNamespace("default")
                .withLabel(LABEL_APP_NAME, "recipe-detection")
                .list()
                .getItems();
    }

    private HelmRelease parseConfigMap(ConfigMap cm) {
        try {
            String json = cm.getData().get(RECIPE_DATA_KEY);
            if (json == null || json.isBlank()) return null;

            JsonNode root = objectMapper.readTree(json);
            String chartVersion = root.get("chartVersion").asText();
            String releaseName = cm.getMetadata().getAnnotations()
                    .getOrDefault(ANNOTATION_RELEASE_NAME, "unknown");

            List<Recipe> recipes = new ArrayList<>();
            for (JsonNode rNode : root.get("recipes")) {
                Map<String, String> components = new LinkedHashMap<>();
                rNode.get("components").fields().forEachRemaining(
                        e -> components.put(e.getKey(), e.getValue().asText()));

                List<String> upgradePaths = new ArrayList<>();
                rNode.get("upgradePaths").forEach(p -> upgradePaths.add(p.asText()));

                recipes.add(new Recipe(
                        rNode.get("version").asText(),
                        rNode.has("description") ? rNode.get("description").asText() : "",
                        components,
                        upgradePaths
                ));
            }

            return new HelmRelease(chartVersion, releaseName, "deployed", recipes);
        } catch (Exception e) {
            log.warn("Failed to parse ConfigMap {}: {}", cm.getMetadata().getName(), e.getMessage());
            return null;
        }
    }

    public List<HelmRelease> getAllHelmReleases() {
        List<ConfigMap> configMaps = fetchRecipeConfigMaps();
        // Deduplicate by chartVersion — keep the newest ConfigMap per version
        Map<String, HelmRelease> byVersion = new LinkedHashMap<>();
        for (ConfigMap cm : configMaps) {
            HelmRelease release = parseConfigMap(cm);
            if (release != null && !byVersion.containsKey(release.getVersion())) {
                byVersion.put(release.getVersion(), release);
            }
        }
        // Sort by version
        return byVersion.values().stream()
                .sorted(Comparator.comparing(HelmRelease::getVersion))
                .collect(Collectors.toList());
    }

    public HelmRelease getHelmRelease(String version) {
        return getAllHelmReleases().stream()
                .filter(h -> h.getVersion().equals(version))
                .findFirst()
                .orElse(null);
    }

    public HelmRelease createHelmRelease(HelmRelease release) {
        if (getHelmRelease(release.getVersion()) != null) {
            return null;
        }
        if (release.getRecipes() == null) {
            release.setRecipes(new ArrayList<>());
        }
        if (release.getStatus() == null || release.getStatus().isEmpty()) {
            release.setStatus("pending");
        }

        // Create a ConfigMap in K8s
        try {
            String json = buildRecipeJson(release);
            ConfigMap cm = new io.fabric8.kubernetes.api.model.ConfigMapBuilder()
                    .withNewMetadata()
                        .withName("recipe-v" + release.getVersion().replace(".", "-") + "-config")
                        .withNamespace("default")
                        .addToLabels(LABEL_APP_NAME, "recipe-detection")
                        .addToLabels(LABEL_APP_VERSION, release.getVersion())
                        .addToLabels("app.kubernetes.io/managed-by", "recipe-detection-api")
                        .addToAnnotations(ANNOTATION_RELEASE_NAME, release.getReleaseName() != null
                                ? release.getReleaseName() : "recipe-v" + release.getVersion().replace(".", "-"))
                    .endMetadata()
                    .addToData("chart-version", release.getVersion())
                    .addToData(RECIPE_DATA_KEY, json)
                    .build();
            kubernetesClient.configMaps().inNamespace("default").resource(cm).create();
            log.info("Created ConfigMap for helm release {}", release.getVersion());
        } catch (Exception e) {
            log.error("Failed to create ConfigMap for release {}: {}", release.getVersion(), e.getMessage());
            return null;
        }
        return release;
    }

    public HelmRelease updateHelmRelease(String version, HelmRelease updated) {
        HelmRelease existing = getHelmRelease(version);
        if (existing == null) return null;

        if (updated.getReleaseName() != null) existing.setReleaseName(updated.getReleaseName());
        if (updated.getStatus() != null) existing.setStatus(updated.getStatus());
        if (updated.getRecipes() != null) existing.setRecipes(new ArrayList<>(updated.getRecipes()));

        updateConfigMap(version, existing);
        return existing;
    }

    public boolean deleteHelmRelease(String version) {
        List<ConfigMap> configMaps = fetchRecipeConfigMaps();
        for (ConfigMap cm : configMaps) {
            HelmRelease release = parseConfigMap(cm);
            if (release != null && release.getVersion().equals(version)) {
                kubernetesClient.configMaps().inNamespace("default")
                        .withName(cm.getMetadata().getName()).delete();
                log.info("Deleted ConfigMap {} for helm release {}", cm.getMetadata().getName(), version);
                return true;
            }
        }
        return false;
    }

    public Recipe addRecipeToRelease(String helmVersion, Recipe recipe) {
        HelmRelease release = getHelmRelease(helmVersion);
        if (release == null) return null;

        boolean exists = release.getRecipes().stream()
                .anyMatch(r -> r.getVersion().equals(recipe.getVersion()));
        if (exists) return null;

        if (recipe.getComponents() == null) recipe.setComponents(new LinkedHashMap<>());
        if (recipe.getUpgradePaths() == null) recipe.setUpgradePaths(new ArrayList<>());
        release.getRecipes().add(recipe);

        updateConfigMap(helmVersion, release);
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

        updateConfigMap(helmVersion, release);
        return existing;
    }

    public boolean deleteRecipeFromRelease(String helmVersion, String recipeVersion) {
        HelmRelease release = getHelmRelease(helmVersion);
        if (release == null) return false;

        boolean removed = release.getRecipes().removeIf(r -> r.getVersion().equals(recipeVersion));
        if (removed) {
            updateConfigMap(helmVersion, release);
        }
        return removed;
    }

    public List<Recipe> getRecipesByHelmVersion(String version) {
        HelmRelease release = getHelmRelease(version);
        if (release == null) return Collections.emptyList();
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

    private void updateConfigMap(String chartVersion, HelmRelease release) {
        try {
            List<ConfigMap> configMaps = fetchRecipeConfigMaps();
            for (ConfigMap cm : configMaps) {
                HelmRelease parsed = parseConfigMap(cm);
                if (parsed != null && parsed.getVersion().equals(chartVersion)) {
                    String json = buildRecipeJson(release);
                    cm.getData().put(RECIPE_DATA_KEY, json);
                    kubernetesClient.configMaps().inNamespace("default")
                            .resource(cm).update();
                    log.info("Updated ConfigMap {} for helm release {}", cm.getMetadata().getName(), chartVersion);
                    return;
                }
            }
        } catch (Exception e) {
            log.error("Failed to update ConfigMap for release {}: {}", chartVersion, e.getMessage());
        }
    }

    private String buildRecipeJson(HelmRelease release) {
        try {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("chartVersion", release.getVersion());
            List<Map<String, Object>> recipeMaps = new ArrayList<>();
            for (Recipe r : release.getRecipes()) {
                Map<String, Object> rMap = new LinkedHashMap<>();
                rMap.put("version", r.getVersion());
                rMap.put("description", r.getDescription());
                rMap.put("components", r.getComponents());
                rMap.put("upgradePaths", r.getUpgradePaths());
                recipeMaps.add(rMap);
            }
            data.put("recipes", recipeMaps);
            return objectMapper.writeValueAsString(data);
        } catch (Exception e) {
            log.error("Failed to build recipe JSON: {}", e.getMessage());
            return "{}";
        }
    }
}
