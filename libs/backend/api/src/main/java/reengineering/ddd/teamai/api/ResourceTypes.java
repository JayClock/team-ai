package reengineering.ddd.teamai.api;

public class ResourceTypes {
  private static final String VENDOR = "application/vnd.business-driven-ai";
  public static final String USER = VENDOR + ".user+json";
  public static final String PROJECT = VENDOR + ".project+json";
  public static final String LOGICAL_ENTITY = VENDOR + ".logical-entity+json";
  public static final String DIAGRAM = VENDOR + ".diagram+json";
  public static final String DIAGRAM_VERSION = VENDOR + ".diagram-version+json";
  public static final String NODE = VENDOR + ".node+json";
  public static final String EDGE = VENDOR + ".edge+json";
}
