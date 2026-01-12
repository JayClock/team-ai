package reengineering.ddd.knowledgegraph.model;

public enum Layer {
  API_LAYER("API Layer"),
  DOMAIN_LAYER("Domain Layer"),
  INFRASTRUCTURE_LAYER("Infrastructure Layer");

  private final String displayName;

  Layer(String displayName) {
    this.displayName = displayName;
  }

  public String getDisplayName() {
    return displayName;
  }
}
