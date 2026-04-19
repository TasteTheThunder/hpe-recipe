package com.hpe.recipe.controller;

import com.hpe.recipe.config.ReleaseWebSocketHandler;
import com.hpe.recipe.model.HelmRelease;
import com.hpe.recipe.model.Recipe;
import com.hpe.recipe.service.GitOpsService;
import com.hpe.recipe.service.HelmReleaseService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@CrossOrigin(origins = "*")
@RequestMapping("/helm-releases")
public class HelmReleaseController {
    @Value("${jenkins.username}")
    private String jenkinsUser;

    @Value("${jenkins.token}")
    private String jenkinsToken;

    private final HelmReleaseService helmReleaseService;
    private final ReleaseWebSocketHandler wsHandler;
    private final GitOpsService gitOpsService;

    public HelmReleaseController(HelmReleaseService helmReleaseService,
                                 ReleaseWebSocketHandler wsHandler,
                                 GitOpsService gitOpsService) {
        this.helmReleaseService = helmReleaseService;
        this.wsHandler = wsHandler;
        this.gitOpsService = gitOpsService;
    }

    // 🔥 GET ALL (cluster-specific)
    @GetMapping
    public List<Map<String, String>> getAllHelmReleases(@RequestParam String cluster) {

        List<Map<String, String>> lightweight = new ArrayList<>();

        for (HelmRelease release : helmReleaseService.getAllHelmReleases(cluster)) {

            Map<String, String> summary = new LinkedHashMap<>();
            summary.put("version", release.getVersion());
            summary.put("releaseName", release.getReleaseName());
            summary.put("status", release.getStatus());
            summary.put("cluster", cluster);

            lightweight.add(summary);
        }

        return lightweight;
    }

    // 🔥 GET ONE
    @GetMapping("/{version}")
    public ResponseEntity<HelmRelease> getHelmRelease(
            @PathVariable String version,
            @RequestParam String cluster) {

        HelmRelease release = helmReleaseService.getHelmRelease(cluster, version);

        if (release == null) return ResponseEntity.notFound().build();

        release.setCluster(cluster); // 🔥 attach cluster info

        return ResponseEntity.ok(release);
    }

    // 🔥 CREATE
    @PostMapping
    public ResponseEntity<HelmRelease> createHelmRelease(
            @RequestParam String cluster,
            @RequestBody HelmRelease release) {

        HelmRelease created = helmReleaseService.createHelmRelease(cluster, release);

        if (created == null) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }

        created.setCluster(cluster);

        wsHandler.broadcast("release_created", created);

        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    // 🔥 UPDATE
    @PutMapping("/{version}")
    public ResponseEntity<HelmRelease> updateHelmRelease(
            @PathVariable String version,
            @RequestParam String cluster,
            @RequestBody HelmRelease release) {

        HelmRelease updated = helmReleaseService.updateHelmRelease(cluster, version, release);

        if (updated == null) return ResponseEntity.notFound().build();

        updated.setCluster(cluster);

        wsHandler.broadcast("release_updated", updated);

        return ResponseEntity.ok(updated);
    }

    // 🔥 UPDATE STATUS
    @PutMapping("/{version}/status")
    public ResponseEntity<HelmRelease> updateStatus(
            @PathVariable String version,
            @RequestParam String cluster,
            @RequestBody Map<String, String> body) {

        String status = body.get("status");

        if (status == null || status.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        HelmRelease release = helmReleaseService.getHelmRelease(cluster, version);

        if (release == null) return ResponseEntity.notFound().build();

        release.setStatus(status);

        wsHandler.broadcast("status_changed",
                Map.of("version", version, "status", status, "cluster", cluster));

        return ResponseEntity.ok(release);
    }

    // 🔥 DEPLOY
    @PostMapping("/{version}/deploy")
    public ResponseEntity<?> deployRelease(
            @PathVariable String version,
            @RequestParam String cluster) {

        HelmRelease release = helmReleaseService.getHelmRelease(cluster, version);

        if (release == null) return ResponseEntity.notFound().build();

        if (release.getRecipes() == null || release.getRecipes().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Cannot deploy release with no recipes"));
        }

        release.setStatus("deploying");

        wsHandler.broadcast("status_changed",
                Map.of("version", version, "status", "deploying", "cluster", cluster));

        try {
            gitOpsService.generateAndPush(release);
            // 🔥 NEW: Trigger Jenkins with cluster
            triggerJenkins(cluster);

            return ResponseEntity.ok(Map.of(
                    "message", "Pushed to Git. Jenkins will deploy shortly.",
                    "version", version,
                    "cluster", cluster
            ));

        } catch (Exception e) {

            release.setStatus("push_failed");

            wsHandler.broadcast("status_changed",
                    Map.of("version", version, "status", "push_failed", "cluster", cluster));

            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // 🔥 DELETE
    @DeleteMapping("/{version}")
    public ResponseEntity<Void> deleteHelmRelease(
            @PathVariable String version,
            @RequestParam String cluster) {

        boolean deleted = helmReleaseService.deleteHelmRelease(cluster, version);

        if (!deleted) return ResponseEntity.notFound().build();

        wsHandler.broadcast("release_deleted",
                Map.of("version", version, "cluster", cluster));

        return ResponseEntity.noContent().build();
    }

    // 🔥 RECIPES
    @GetMapping("/{version}/recipes")
    public List<Recipe> getRecipes(
            @PathVariable String version,
            @RequestParam String cluster) {

        return helmReleaseService.getRecipesByHelmVersion(cluster, version);
    }

    @PostMapping("/{version}/recipes")
    public ResponseEntity<Recipe> addRecipe(
            @PathVariable String version,
            @RequestParam String cluster,
            @RequestBody Recipe recipe) {

        Recipe added = helmReleaseService.addRecipeToRelease(cluster, version, recipe);

        if (added == null) return ResponseEntity.status(HttpStatus.CONFLICT).build();

        wsHandler.broadcast("recipe_added",
                Map.of("helmVersion", version, "cluster", cluster, "recipe", added));

        return ResponseEntity.status(HttpStatus.CREATED).body(added);
    }

    @PutMapping("/{version}/recipes/{recipeVersion}")
    public ResponseEntity<Recipe> updateRecipe(
            @PathVariable String version,
            @PathVariable String recipeVersion,
            @RequestParam String cluster,
            @RequestBody Recipe recipe) {

        Recipe updated = helmReleaseService.updateRecipeInRelease(cluster, version, recipeVersion, recipe);

        if (updated == null) return ResponseEntity.notFound().build();

        wsHandler.broadcast("recipe_updated",
                Map.of("helmVersion", version, "cluster", cluster, "recipe", updated));

        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{version}/recipes/{recipeVersion}")
    public ResponseEntity<Void> deleteRecipe(
            @PathVariable String version,
            @PathVariable String recipeVersion,
            @RequestParam String cluster) {

        boolean deleted = helmReleaseService.deleteRecipeFromRelease(cluster, version, recipeVersion);

        if (!deleted) return ResponseEntity.notFound().build();

        wsHandler.broadcast("recipe_deleted",
                Map.of("helmVersion", version, "cluster", cluster, "recipeVersion", recipeVersion));

        return ResponseEntity.noContent().build();
    }

    // 🔥 COMPONENTS
    @GetMapping("/{version}/recipes/{recipeVersion}/components")
    public Map<String, String> getComponents(
            @PathVariable String version,
            @PathVariable String recipeVersion,
            @RequestParam String cluster) {

        return helmReleaseService.getComponentsByRecipe(cluster, version, recipeVersion);
    }

    // 🔥 UPGRADE PATHS
    @GetMapping("/{version}/recipes/{recipeVersion}/upgradePaths")
    public List<String> getUpgradePaths(
            @PathVariable String version,
            @PathVariable String recipeVersion,
            @RequestParam String cluster) {

        return helmReleaseService.getUpgradePaths(cluster, version, recipeVersion);
    }

    // 🔥 COMPARE (cluster-specific)
    @GetMapping("/compare")
    public Map<String, Object> compareHelmVersions(
            @RequestParam String cluster,
            @RequestParam String from,
            @RequestParam String to) {

        return helmReleaseService.getUpgradePathsBetweenHelmVersions(cluster, from, to);
    }

    private void triggerJenkins(String cluster) {
        try {
            String url = "http://localhost:8080/job/hpe-recipe/buildWithParameters?CLUSTER=" + cluster;

            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();

            String auth = jenkinsUser + ":" + jenkinsToken;   // ✅ USE ENV VALUES
            byte[] encodedAuth = java.util.Base64.getEncoder().encode(auth.getBytes());
            String authHeader = "Basic " + new String(encodedAuth);

            headers.set("Authorization", authHeader);

            org.springframework.http.HttpEntity<String> entity =
                    new org.springframework.http.HttpEntity<>(headers);

            org.springframework.web.client.RestTemplate restTemplate =
                    new org.springframework.web.client.RestTemplate();

            restTemplate.exchange(url, org.springframework.http.HttpMethod.POST, entity, String.class);

            System.out.println("🔥 Jenkins triggered for cluster: " + cluster);

        } catch (Exception e) {
            System.out.println("❌ Jenkins trigger failed: " + e.getMessage());
        }
    }
}