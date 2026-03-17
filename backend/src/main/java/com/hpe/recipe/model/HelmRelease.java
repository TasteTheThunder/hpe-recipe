package com.hpe.recipe.model;

import java.util.List;

public class HelmRelease {

    private String version;
    private String releaseName;
    private String status;
    private List<Recipe> recipes;

    public HelmRelease() {}

    public HelmRelease(String version, String releaseName, String status, List<Recipe> recipes) {
        this.version = version;
        this.releaseName = releaseName;
        this.status = status;
        this.recipes = recipes;
    }

    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }

    public String getReleaseName() { return releaseName; }
    public void setReleaseName(String releaseName) { this.releaseName = releaseName; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public List<Recipe> getRecipes() { return recipes; }
    public void setRecipes(List<Recipe> recipes) { this.recipes = recipes; }
}
