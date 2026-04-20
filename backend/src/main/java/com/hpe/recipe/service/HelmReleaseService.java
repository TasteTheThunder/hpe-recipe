package com.hpe.recipe.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hpe.recipe.model.HelmRelease;
import com.hpe.recipe.model.Recipe;
import io.fabric8.kubernetes.api.model.ConfigMap;
import io.fabric8.kubernetes.api.model.StatusDetails;
import io.fabric8.kubernetes.client.KubernetesClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class HelmReleaseService {

    private static final Logger log = LoggerFactory.getLogger(HelmReleaseService.class);

    private static final String LABEL_APP_NAME = "app.kubernetes.io/name";
    private static final String LABEL_MANAGED_BY = "app.kubernetes.io/managed-by";
    private static final String LABEL_APP_VERSION = "app.kubernetes.io/version";
    private static final String ANNOTATION_RELEASE_NAME = "meta.helm.sh/release-name";
    private static final String RECIPE_DATA_KEY = "recipe-data.json";

    private final Map<String, KubernetesClient> clients;
    private final Map<String, Map<String, HelmRelease>> draftReleasesByCluster = new ConcurrentHashMap<>();
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

    private boolean isHelmManaged(ConfigMap cm) {
        Map<String, String> labels = cm.getMetadata() != null ? cm.getMetadata().getLabels() : null;
        String managedBy = labels != null ? labels.get(LABEL_MANAGED_BY) : null;
        return "Helm".equalsIgnoreCase(managedBy);
    }

    private Map<String, HelmRelease> draftsForCluster(String cluster) {
        return draftReleasesByCluster.computeIfAbsent(cluster, k -> new ConcurrentHashMap<>());
    }

    private HelmRelease copyRelease(HelmRelease source) {
        if (source == null) {
            return null;
        }

        HelmRelease copy = new HelmRelease();
        copy.setVersion(source.getVersion());
        copy.setReleaseName(source.getReleaseName());
        copy.setStatus(source.getStatus());
        copy.setCluster(source.getCluster());

        List<Recipe> copiedRecipes = new ArrayList<>();
        if (source.getRecipes() != null) {
            for (Recipe recipe : source.getRecipes()) {
                Recipe r = new Recipe();
                r.setVersion(recipe.getVersion());
                r.setDescription(recipe.getDescription());
                r.setComponents(recipe.getComponents() == null
                        ? new LinkedHashMap<>()
                        : new LinkedHashMap<>(recipe.getComponents()));
                r.setUpgradePaths(recipe.getUpgradePaths() == null
                        ? new ArrayList<>()
                        : new ArrayList<>(recipe.getUpgradePaths()));
                copiedRecipes.add(r);
            }
        }
        copy.setRecipes(copiedRecipes);

        return copy;
    }

    private void storeDraft(String cluster, HelmRelease release) {
        HelmRelease stored = copyRelease(release);
        stored.setCluster(cluster);
        draftsForCluster(cluster).put(stored.getVersion(), stored);
    }

    private HelmRelease getDraft(String cluster, String version) {
        HelmRelease draft = draftsForCluster(cluster).get(version);
        if (draft == null) {
            return null;
        }
        HelmRelease copied = copyRelease(draft);
        copied.setCluster(cluster);
        return copied;
    }

    private void removeDraft(String cluster, String version) {
        draftsForCluster(cluster).remove(version);
    }

    private boolean helmManagedReleaseExists(String cluster, String version) {
        List<ConfigMap> cms = fetchRecipeConfigMaps(cluster);

        return cms.stream().anyMatch(cm -> {
            HelmRelease parsed = parseConfigMap(cluster, cm);
            return parsed != null
                    && version.equals(parsed.getVersion())
                    && isHelmManaged(cm);
        });
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
                String status = root.has("status") ? root.get("status").asText() : "deployed";

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

            return new HelmRelease(version, releaseName, status, cluster, recipes);

        } catch (Exception e) {
            log.warn("Parse error: {}", e.getMessage());
            return null;
        }
    }

    // ================= CRUD =================

    public List<HelmRelease> getAllHelmReleases(String cluster) {

        List<ConfigMap> cms = fetchRecipeConfigMaps(cluster);

        // One release per chart version in API responses.
        // If both draft and Helm configmaps exist, prefer draft (pending/deploying state).
        Map<String, ConfigMap> selectedByVersion = new LinkedHashMap<>();
        for (ConfigMap cm : cms) {
            HelmRelease parsed = parseConfigMap(cluster, cm);
            if (parsed == null) {
                continue;
            }

            ConfigMap existing = selectedByVersion.get(parsed.getVersion());
            if (existing == null) {
                selectedByVersion.put(parsed.getVersion(), cm);
                continue;
            }

            if (isHelmManaged(existing) && !isHelmManaged(cm)) {
                selectedByVersion.put(parsed.getVersion(), cm);
            }
        }

        Map<String, HelmRelease> merged = selectedByVersion.values().stream()
                .map(cm -> parseConfigMap(cluster, cm))
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(
                        HelmRelease::getVersion,
                        this::copyRelease,
                        (a, b) -> a,
                        LinkedHashMap::new
                ));

        draftsForCluster(cluster).forEach((version, draft) -> merged.put(version, copyRelease(draft)));

        return merged.values().stream()
                .peek(r -> r.setCluster(cluster))
                .sorted(Comparator.comparing(HelmRelease::getVersion))
                .collect(Collectors.toList());
    }

    public HelmRelease getHelmRelease(String cluster, String version) {
        HelmRelease draft = getDraft(cluster, version);
        if (draft != null) {
            return draft;
        }

        return getAllHelmReleases(cluster).stream()
                .filter(h -> h.getVersion().equals(version))
                .findFirst()
                .orElse(null);
    }

    public HelmRelease createHelmRelease(String cluster, HelmRelease release) {

        if (getHelmRelease(cluster, release.getVersion()) != null) return null;

        if (release.getStatus() == null || release.getStatus().isBlank()) {
            release.setStatus("pending");
        }

        storeDraft(cluster, release);
        return getDraft(cluster, release.getVersion());
    }

    public HelmRelease updateHelmRelease(String cluster, String version, HelmRelease release) {
        if (draftsForCluster(cluster).containsKey(version)) {
            release.setVersion(version);
            storeDraft(cluster, release);
            return getDraft(cluster, version);
        }

        if (getHelmRelease(cluster, version) == null) return null;
        updateConfigMap(cluster, version, release);
        return release;
    }

    public boolean deleteHelmRelease(String cluster, String version) {

        removeDraft(cluster, version);

        List<ConfigMap> cms = fetchRecipeConfigMaps(cluster);
        boolean deleted = false;

        for (ConfigMap cm : cms) {
            HelmRelease r = parseConfigMap(cluster, cm);

            if (r != null && r.getVersion().equals(version)) {

                List<StatusDetails> result = getClient(cluster).configMaps()
                        .inNamespace("default")
                        .withName(cm.getMetadata().getName())
                        .delete();

                boolean removed = result != null && !result.isEmpty();

                deleted = deleted || removed;
            }
        }

        return deleted;
    }

    public void cleanupDraftConfigMapsIfHelmExists(String cluster, String version) {
        List<ConfigMap> cms = fetchRecipeConfigMaps(cluster);

        boolean helmExistsForVersion = cms.stream().anyMatch(cm -> {
            HelmRelease parsed = parseConfigMap(cluster, cm);
            return parsed != null
                    && version.equals(parsed.getVersion())
                    && isHelmManaged(cm);
        });

        if (!helmExistsForVersion) {
            return;
        }

        for (ConfigMap cm : cms) {
            HelmRelease parsed = parseConfigMap(cluster, cm);
            if (parsed != null
                    && version.equals(parsed.getVersion())
                    && !isHelmManaged(cm)) {
                getClient(cluster).configMaps()
                        .inNamespace("default")
                        .withName(cm.getMetadata().getName())
                        .delete();
            }
        }
    }

    public void cleanupDraftReleaseIfHelmExists(String cluster, String version) {
        if (helmManagedReleaseExists(cluster, version)) {
            removeDraft(cluster, version);
        }
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

                if (parsed != null
                    && parsed.getVersion().equals(version)
                    && !isHelmManaged(cm)) {

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
            data.put("status", release.getStatus());

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