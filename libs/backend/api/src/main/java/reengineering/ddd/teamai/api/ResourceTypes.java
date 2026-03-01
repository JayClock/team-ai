package reengineering.ddd.teamai.api;

public class ResourceTypes {
  private static final String VENDOR = "application/vnd.business-driven-ai";

  public static final String USER = VENDOR + ".user+json";
  public static final String USER_COLLECTION = VENDOR + ".users+json";

  public static final String ACCOUNT = VENDOR + ".account+json";
  public static final String ACCOUNT_COLLECTION = VENDOR + ".accounts+json";

  public static final String PROJECT = VENDOR + ".project+json";
  public static final String PROJECT_COLLECTION = VENDOR + ".projects+json";

  public static final String CONVERSATION = VENDOR + ".conversation+json";
  public static final String CONVERSATION_COLLECTION = VENDOR + ".conversations+json";

  public static final String MESSAGE = VENDOR + ".message+json";
  public static final String MESSAGE_COLLECTION = VENDOR + ".messages+json";

  public static final String LOGICAL_ENTITY = VENDOR + ".logical-entity+json";
  public static final String LOGICAL_ENTITY_COLLECTION = VENDOR + ".logical-entities+json";

  public static final String DIAGRAM = VENDOR + ".diagram+json";
  public static final String DIAGRAM_COLLECTION = VENDOR + ".diagrams+json";

  public static final String DIAGRAM_VERSION = VENDOR + ".diagram-version+json";
  public static final String DIAGRAM_VERSION_COLLECTION = VENDOR + ".diagram-versions+json";

  public static final String NODE = VENDOR + ".node+json";
  public static final String NODE_COLLECTION = VENDOR + ".nodes+json";

  public static final String EDGE = VENDOR + ".edge+json";
  public static final String EDGE_COLLECTION = VENDOR + ".edges+json";

  public static final String KNOWLEDGE_GRAPH = VENDOR + ".knowledge-graph+json";
  public static final String KNOWLEDGE_GRAPH_COLLECTION = VENDOR + ".knowledge-graphs+json";
}
