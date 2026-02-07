package reengineering.ddd.teamai.description;

/**
 * Relationship types for edges in Fulfillment Modeling diagrams. Defines the semantic meaning of
 * connections between nodes.
 */
public enum EdgeRelationType {
  // Evidence flow relationships (Fulfillment Modeling)
  SEQUENCE("sequence"),
  TRIGGERS("triggers"),

  // Participation relationships (Fulfillment Modeling)
  PARTICIPATES("participates"),
  INVOLVES("involves"),

  // Role relationships (Fulfillment Modeling)
  PLAYS("plays"),
  ABSTRACTS("abstracts"),

  // Context relationships (Fulfillment Modeling)
  BELONGS_TO("belongs_to"),
  REFERENCES("references"),

  // UML Class Diagram relationships
  ASSOCIATION("ASSOCIATION"),
  INHERITANCE("INHERITANCE"),
  AGGREGATION("AGGREGATION"),
  COMPOSITION("COMPOSITION"),
  DEPENDENCY("DEPENDENCY"),
  REALIZATION("REALIZATION"),

  // Flow relationships
  FLOW("FLOW");

  private final String value;

  EdgeRelationType(String value) {
    this.value = value;
  }

  public String getValue() {
    return value;
  }

  public static EdgeRelationType fromValue(String value) {
    for (EdgeRelationType type : values()) {
      if (type.value.equals(value)) {
        return type;
      }
    }
    throw new IllegalArgumentException("Unknown edge relation type: " + value);
  }
}
