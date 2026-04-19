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

    private final Map<String, KubernetesClient> clients;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public HelmReleaseService(Map<String, KubernetesClient> clients) {
        this.clients = clients;
    }

    // ================= CLIENT =================

    private KubernetesClient getClient(String cluster) {
        KubernetesClient client = clients.get(cluster);
        if (client == null) {
            throw new RuntimeException("Invalid cluster: " + cluster);
        }
        return client;
    }

    private List<ConfigMap> fetchRecipeConfigMaps(String cluster) {
        return getClient(cluster).configMaps()
                .inNamespace("default")
                .withLabel(LABEL_APP_NAME, "recipe-detection")
                .list()
                .getItems();
    }

    // ================= PARSE =================

    private HelmRelease parseConfigMap(String cluster, ConfigMap cm) {
        try {
            String json = cm.getData().get(RECIPE_DATA_KEY);
            if (json == null || json.isBlank()) return null;

            JsonNode root = objectMapper.readTree(json);
            String version = root.get("chartVersion").asText();
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

            return new HelmRelease(version, releaseName, "deployed", cluster, recipes);

        } catch (Exception e) {
            log.warn("Parse error: {}", e.getMessage());
            return null;
        }
    }

    // ================= CRUD =================

    public List<HelmRelease> getAllHelmReleases(String cluster) {

        List<ConfigMap> cms = fetchRecipeConfigMaps(cluster);

        return cms.stream()
                .map(cm -> parseConfigMap(cluster, cm))
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(HelmRelease::getVersion))
                .collect(Collectors.toList());
    }

    public HelmRelease getHelmRelease(String cluster, String version) {
        return getAllHelmReleases(cluster).stream()
                .filter(h -> h.getVersion().equals(version))
                .findFirst()
                .orElse(null);
    }

    public HelmRelease createHelmRelease(String cluster, HelmRelease release) {

        if (getHelmRelease(cluster, release.getVersion()) != null) return null;

        try {
            String json = buildRecipeJson(release);

            ConfigMap cm = new io.fabric8.kubernetes.api.model.ConfigMapBuilder()
                    .withNewMetadata()
                    .withName("recipe-v" + release.getVersion().replace(".", "-"))
                    .withNamespace("default")
                    .addToLabels(LABEL_APP_NAME, "recipe-detection")
                    .addToLabels(LABEL_APP_VERSION, release.getVersion())
                    .addToAnnotations(ANNOTATION_RELEASE_NAME, release.getReleaseName())
                    .endMetadata()
                    .addToData(RECIPE_DATA_KEY, json)
                    .build();

            getClient(cluster).configMaps().inNamespace("default").resource(cm).create();

            return release;

        } catch (Exception e) {
            log.error("Create failed: {}", e.getMessage());
            return null;
        }
    }

    public HelmRelease updateHelmRelease(String cluster, String version, HelmRelease release) {
        if (getHelmRelease(cluster, version) == null) return null;
        updateConfigMap(cluster, version, release);
        return release;
    }

    public boolean deleteHelmRelease(String cluster, String version) {

        List<ConfigMap> cms = fetchRecipeConfigMaps(cluster);

        for (ConfigMap cm : cms) {
            HelmRelease r = parseConfigMap(cluster, cm);
            if (r != null && r.getVersion().equals(version)) {
                getClient(cluster).configMaps()
                        .inNamespace("default")
                        .withName(cm.getMetadata().getName())
                        .delete();
                return true;
            }
        }
        return false;
    }

    // ================= RECIPE =================

    public List<Recipe> getRecipesByHelmVersion(String cluster, String version) {
        HelmRelease r = getHelmRelease(cluster, version);
        return r != null ? r.getRecipes() : Collections.emptyList();
    }

    public Recipe addRecipeToRelease(String cluster, String version, Recipe recipe) {

        HelmRelease r = getHelmRelease(cluster, version);
        if (r == null) return null;

        r.getRecipes().add(recipe);
        updateConfigMap(cluster, version, r);

        return recipe;
    }

    public Recipe updateRecipeInRelease(String cluster, String version, String recipeVersion, Recipe recipe) {

        HelmRelease r = getHelmRelease(cluster, version);
        if (r == null) return null;

        for (int i = 0; i < r.getRecipes().size(); i++) {
            if (r.getRecipes().get(i).getVersion().equals(recipeVersion)) {
                r.getRecipes().set(i, recipe);
                updateConfigMap(cluster, version, r);
                return recipe;
            }
        }
        return null;
    }

    public boolean deleteRecipeFromRelease(String cluster, String version, String recipeVersion) {

        HelmRelease r = getHelmRelease(cluster, version);
        if (r == null) return false;

        boolean removed = r.getRecipes().removeIf(x -> x.getVersion().equals(recipeVersion));

        if (removed) updateConfigMap(cluster, version, r);

        return removed;
    }

    public Map<String, String> getComponentsByRecipe(String cluster, String version, String recipeVersion) {

        HelmRelease r = getHelmRelease(cluster, version);
        if (r == null) return Collections.emptyMap();

        return r.getRecipes().stream()
                .filter(x -> x.getVersion().equals(recipeVersion))
                .findFirst()
                .map(Recipe::getComponents)
                .orElse(Collections.emptyMap());
    }

    public List<String> getUpgradePaths(String cluster, String version, String recipeVersion) {

        HelmRelease r = getHelmRelease(cluster, version);
        if (r == null) return Collections.emptyList();

        return r.getRecipes().stream()
                .filter(x -> x.getVersion().equals(recipeVersion))
                .findFirst()
                .map(Recipe::getUpgradePaths)
                .orElse(Collections.emptyList());
    }

    // ================= COMPARE =================

    public Map<String, Object> getUpgradePathsBetweenHelmVersions(String cluster, String from, String to) {

        HelmRelease r1 = getHelmRelease(cluster, from);
        HelmRelease r2 = getHelmRelease(cluster, to);

        if (r1 == null || r2 == null) return Map.of("error", "Invalid versions");

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("from", from);
        result.put("to", to);

        List<Map<String, String>> diffs = new ArrayList<>();

        for (Recipe a : r1.getRecipes()) {

            Optional<Recipe> match = r2.getRecipes().stream()
                    .filter(b -> b.getVersion().equals(a.getVersion()))
                    .findFirst();

            if (match.isPresent()) {

                Map<String, String> diff = new LinkedHashMap<>();

                for (String comp : a.getComponents().keySet()) {

                    String v1 = a.getComponents().get(comp);
                    String v2 = match.get().getComponents().get(comp);

                    if (!Objects.equals(v1, v2)) {
                        diff.put(comp, v1 + " → " + v2);
                    }
                }

                if (!diff.isEmpty()) diffs.add(diff);
            }
        }

        result.put("differences", diffs);

        return result;
    }

    // ================= INTERNAL =================

    private void updateConfigMap(String cluster, String version, HelmRelease release) {

        List<ConfigMap> cms = fetchRecipeConfigMaps(cluster);

        for (ConfigMap cm : cms) {

            HelmRelease parsed = parseConfigMap(cluster, cm);

            if (parsed != null && parsed.getVersion().equals(version)) {

                try {
                    cm.getData().put(RECIPE_DATA_KEY, buildRecipeJson(release));

                    getClient(cluster).configMaps()
                            .inNamespace("default")
                            .resource(cm)
                            .update();

                } catch (Exception e) {
                    log.error("Update failed: {}", e.getMessage());
                }
            }
        }
    }

    private String buildRecipeJson(HelmRelease release) {

        try {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("chartVersion", release.getVersion());

            List<Map<String, Object>> recipes = new ArrayList<>();

            for (Recipe r : release.getRecipes()) {

                Map<String, Object> map = new LinkedHashMap<>();
                map.put("version", r.getVersion());
                map.put("description", r.getDescription());
                map.put("components", r.getComponents());
                map.put("upgradePaths", r.getUpgradePaths());

                recipes.add(map);
            }

            data.put("recipes", recipes);

            return objectMapper.writeValueAsString(data);

        } catch (Exception e) {
            return "{}";
        }
    }
}