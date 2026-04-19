package com.hpe.recipe.model;

import java.util.List;

public class HelmRelease {

    private String version;
    private String releaseName;
    private String status;
    private String cluster;   // 🔥 NEW FIELD
    private List<Recipe> recipes;

    public HelmRelease() {}

    public HelmRelease(String version, String releaseName, String status,
                       String cluster, List<Recipe> recipes) {
        this.version = version;
        this.releaseName = releaseName;
        this.status = status;
        this.cluster = cluster;
        this.recipes = recipes;
    }

    // 🔹 GETTERS & SETTERS

    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }

    public String getReleaseName() { return releaseName; }
    public void setReleaseName(String releaseName) { this.releaseName = releaseName; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getCluster() { return cluster; }
    public void setCluster(String cluster) { this.cluster = cluster; }

    public List<Recipe> getRecipes() { return recipes; }
    public void setRecipes(List<Recipe> recipes) { this.recipes = recipes; }
}