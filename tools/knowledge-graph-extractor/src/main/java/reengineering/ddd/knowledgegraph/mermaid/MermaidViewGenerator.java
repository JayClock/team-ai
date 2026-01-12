package reengineering.ddd.knowledgegraph.mermaid;

import java.util.*;
import java.util.stream.Collectors;
import reengineering.ddd.knowledgegraph.model.*;

public class MermaidViewGenerator {
  private final Graph graph;

  public MermaidViewGenerator(Graph graph) {
    this.graph = graph;
  }

  public String generateArchitectureView() {
    StringBuilder mermaid = new StringBuilder();
    mermaid.append("```mermaid\n");
    mermaid.append("graph TD\n");
    mermaid.append("  %% 架构视图 - 三层架构\n\n");

    mermaid.append("  %% 配置\n");
    mermaid.append("---\n");
    mermaid.append("config:\n");
    mermaid.append("  theme: forest\n");
    mermaid.append("  layout: elk\n");
    mermaid.append("---\n\n");

    mermaid.append("  %% 层节点\n");
    mermaid.append("  subgraph API_LAYER[\"API Layer\"]\n");
    mermaid.append("    direction TB\n");
    renderNodesInLayer(mermaid, Layer.API_LAYER, "    ");
    mermaid.append("  end\n\n");

    mermaid.append("  subgraph DOMAIN_LAYER[\"Domain Layer\"]\n");
    mermaid.append("    direction TB\n");
    renderNodesInLayer(mermaid, Layer.DOMAIN_LAYER, "    ");
    mermaid.append("  end\n\n");

    mermaid.append("  subgraph INFRASTRUCTURE_LAYER[\"Infrastructure Layer\"]\n");
    mermaid.append("    direction TB\n");
    renderNodesInLayer(mermaid, Layer.INFRASTRUCTURE_LAYER, "    ");
    mermaid.append("  end\n\n");

    mermaid.append("  %% 跨层关系\n");
    renderCrossLayerRelationships(mermaid);

    mermaid.append("```\n");
    return mermaid.toString();
  }

  public String generateApiToDatabaseView() {
    StringBuilder mermaid = new StringBuilder();
    mermaid.append("```mermaid\n");
    mermaid.append("graph LR\n");
    mermaid.append("  %% API → Database 完整流程\n\n");

    mermaid.append("  %% 配置\n");
    mermaid.append("---\n");
    mermaid.append("config:\n");
    mermaid.append("  theme: default\n");
    mermaid.append("  layout: elk\n");
    mermaid.append("---\n\n");

    mermaid.append("  %% 流程节点\n");
    Map<String, Node> apiResources = getNodesByType("JAXRSResource");
    Map<String, Node> entities = getNodesByType("Entity");
    Map<String, Node> mappers = getNodesByType("MyBatisMapper");
    Map<String, Node> tables = getNodesByType("DatabaseTable");

    for (Node api : apiResources.values()) {
      String apiId = sanitizeId(api.getId());
      String apiName = api.getProperty("name").toString();
      String apiPath = api.getProperty("path").toString();
      mermaid.append(
          String.format("  %s[\"%s<br/><small>%s</small>\"]\n", apiId, apiName, apiPath));

      String filePath = api.getFilePath();
      if (filePath != null) {
        String fileUri = filePath.replace("\\", "/");
        mermaid.append(String.format("  click %s \"file:///%s\" \"跳转到源文件\"\n", apiId, fileUri));
      }
    }

    mermaid.append("\n");

    for (Node entity : entities.values()) {
      String entityId = sanitizeId(entity.getId());
      String entityName = entity.getProperty("name").toString();
      mermaid.append(
          String.format("  %s[\"%s<br/><small>Entity</small>\"]\n", entityId, entityName));

      String filePath = entity.getFilePath();
      if (filePath != null) {
        String fileUri = filePath.replace("\\", "/");
        mermaid.append(String.format("  click %s \"file:///%s\" \"跳转到源文件\"\n", entityId, fileUri));
      }
    }

    mermaid.append("\n");

    for (Node mapper : mappers.values()) {
      String mapperId = sanitizeId(mapper.getId());
      String mapperName = mapper.getProperty("name").toString();
      mermaid.append(
          String.format("  %s[\"%s<br/><small>Mapper</small>\"]\n", mapperId, mapperName));

      String filePath = mapper.getFilePath();
      if (filePath != null) {
        String fileUri = filePath.replace("\\", "/");
        mermaid.append(String.format("  click %s \"file:///%s\" \"跳转到源文件\"\n", mapperId, fileUri));
      }
    }

    mermaid.append("\n");

    for (Node table : tables.values()) {
      String tableId = sanitizeId(table.getId());
      String tableName = table.getProperty("name").toString();
      mermaid.append(String.format("  %s[\"%s<br/><small>Table</small>\"]\n", tableId, tableName));
    }

    mermaid.append("\n  %% 流程关系\n");
    renderFlowRelationships(mermaid);

    mermaid.append("```\n");
    return mermaid.toString();
  }

  public String generateSmartDomainView() {
    StringBuilder mermaid = new StringBuilder();
    mermaid.append("```mermaid\n");
    mermaid.append("graph TD\n");
    mermaid.append("  %% Smart Domain 关联模式\n\n");

    mermaid.append("  %% 配置\n");
    mermaid.append("---\n");
    mermaid.append("config:\n");
    mermaid.append("  theme: base\n");
    mermaid.append("  layout: elk\n");
    mermaid.append("---\n\n");

    Map<String, Node> entities = getNodesByType("Entity");
    Map<String, Node> assocInterfaces = getNodesByType("DomainInterface");
    Map<String, Node> assocImpls = getNodesByType("AssociationImplementation");
    Map<String, Node> mappers = getNodesByType("MyBatisMapper");
    Map<String, Node> xmlMappers = getNodesByType("XMLMapper");

    mermaid.append("  %% 实体\n");
    for (Node entity : entities.values()) {
      String entityId = sanitizeId(entity.getId());
      String entityName = entity.getProperty("name").toString();
      mermaid.append(
          String.format("  %s[\"%s<br/><small>Entity</small>\"]\n", entityId, entityName));

      String filePath = entity.getFilePath();
      if (filePath != null) {
        String fileUri = filePath.replace("\\", "/");
        mermaid.append(String.format("  click %s \"file:///%s\" \"跳转到源文件\"\n", entityId, fileUri));
      }
    }

    mermaid.append("\n  %% 关联接口\n");
    for (Node assocInterface : assocInterfaces.values()) {
      String assocId = sanitizeId(assocInterface.getId());
      String assocName = assocInterface.getProperty("name").toString();
      mermaid.append(
          String.format("  %s[\"%s<br/><small>Association</small>\"]\n", assocId, assocName));
    }

    mermaid.append("\n  %% 关联实现\n");
    for (Node assocImpl : assocImpls.values()) {
      String implId = sanitizeId(assocImpl.getId());
      String implName = assocImpl.getProperty("name").toString();
      mermaid.append(String.format("  %s[\"%s<br/><small>Impl</small>\"]\n", implId, implName));

      String filePath = assocImpl.getFilePath();
      if (filePath != null) {
        String fileUri = filePath.replace("\\", "/");
        mermaid.append(String.format("  click %s \"file:///%s\" \"跳转到源文件\"\n", implId, fileUri));
      }
    }

    mermaid.append("\n  %% Mapper\n");
    for (Node mapper : mappers.values()) {
      String mapperId = sanitizeId(mapper.getId());
      String mapperName = mapper.getProperty("name").toString();
      mermaid.append(
          String.format("  %s[\"%s<br/><small>Mapper</small>\"]\n", mapperId, mapperName));
    }

    mermaid.append("\n  %% XML Mapper\n");
    for (Node xml : xmlMappers.values()) {
      String xmlId = sanitizeId(xml.getId());
      String xmlName = xml.getProperty("namespace").toString();
      mermaid.append(String.format("  %s[\"%s<br/><small>XML</small>\"]\n", xmlId, xmlName));
    }

    mermaid.append("\n  %% 关联关系\n");
    renderSmartDomainRelationships(mermaid);

    mermaid.append("```\n");
    return mermaid.toString();
  }

  public String generateCallChainView(String startNodeId) {
    StringBuilder mermaid = new StringBuilder();
    mermaid.append("```mermaid\n");
    mermaid.append("graph TD\n");
    mermaid.append("  %% 方法调用链 - ").append(startNodeId).append("\n\n");

    mermaid.append("  %% 配置\n");
    mermaid.append("---\n");
    mermaid.append("config:\n");
    mermaid.append("  theme: neutral\n");
    mermaid.append("  layout: elk\n");
    mermaid.append("---\n\n");

    Set<String> visitedNodes = new HashSet<>();
    Set<String> visitedRels = new HashSet<>();
    renderCallChain(mermaid, startNodeId, 0, visitedNodes, visitedRels);

    mermaid.append("```\n");
    return mermaid.toString();
  }

  private void renderCallChain(
      StringBuilder mermaid,
      String nodeId,
      int depth,
      Set<String> visitedNodes,
      Set<String> visitedRels) {
    if (depth > 5 || visitedNodes.contains(nodeId)) {
      return;
    }

    visitedNodes.add(nodeId);
    Node node = graph.getNode(nodeId);
    if (node == null) {
      return;
    }

    String nodeType = node.getType();
    String nodeName =
        node.getProperty("name") != null ? node.getProperty("name").toString() : nodeId;
    String nodeInfo = getNodeInfo(node);

    String sanitizedId = sanitizeId(nodeId);
    mermaid.append(
        String.format("  %s[\"%s<br/><small>%s</small>\"]\n", sanitizedId, nodeName, nodeInfo));

    String filePath = node.getFilePath();
    if (filePath != null) {
      String fileUri = filePath.replace("\\", "/");
      mermaid.append(String.format("  click %s \"file:///%s\" \"跳转到源文件\"\n", sanitizedId, fileUri));
    }

    List<Relationship> outgoing = graph.getOutgoingRelationships(nodeId);
    for (Relationship rel : outgoing) {
      if (rel.getType() == Relationship.Type.CALLS
          && !visitedRels.contains(rel.getSourceId() + "->" + rel.getTargetId())) {
        visitedRels.add(rel.getSourceId() + "->" + rel.getTargetId());
        String targetId = sanitizeId(rel.getTargetId());
        mermaid.append(String.format("  %s -->|CALLS| %s\n", sanitizedId, targetId));
        renderCallChain(mermaid, rel.getTargetId(), depth + 1, visitedNodes, visitedRels);
      }
    }
  }

  private void renderNodesInLayer(StringBuilder mermaid, Layer layer, String indent) {
    List<Node> nodes =
        graph.getNodes().stream()
            .filter(
                n -> {
                  String nodeLayer =
                      n.getProperty("layer") != null ? n.getProperty("layer").toString() : "";
                  return nodeLayer.equals(layer.name());
                })
            .collect(Collectors.toList());

    for (Node node : nodes) {
      String nodeId = sanitizeId(node.getId());
      String nodeName =
          node.getProperty("name") != null ? node.getProperty("name").toString() : node.getId();
      String nodeType = node.getType();

      if (nodeType.equals("Layer")) {
        continue;
      }

      mermaid.append(
          String.format(
              "%s%s[\"%s<br/><small>%s</small>\"]\n", indent, nodeId, nodeName, nodeType));

      String filePath = node.getFilePath();
      if (filePath != null) {
        String fileUri = filePath.replace("\\", "/");
        mermaid.append(
            String.format("%s  click %s \"file:///%s\" \"跳转到源文件\"\n", indent, nodeId, fileUri));
      }
    }
  }

  private void renderCrossLayerRelationships(StringBuilder mermaid) {
    List<Relationship> crossLayerRels =
        graph.getRelationships().stream()
            .filter(r -> isCrossLayer(r.getSourceId(), r.getTargetId()))
            .collect(Collectors.toList());

    for (Relationship rel : crossLayerRels) {
      String sourceId = sanitizeId(rel.getSourceId());
      String targetId = sanitizeId(rel.getTargetId());
      String relType = rel.getType().toString();

      mermaid.append(String.format("  %s -->|%s| %s\n", sourceId, relType, targetId));
    }
  }

  private void renderFlowRelationships(StringBuilder mermaid) {
    Set<String> renderedTypes = new HashSet<>();

    for (Relationship rel : graph.getRelationships()) {
      String type = rel.getType().toString();
      if (!renderedTypes.contains(type)) {
        renderRelationshipsByType(mermaid, Relationship.Type.valueOf(type));
        renderedTypes.add(type);
      }
    }
  }

  private void renderSmartDomainRelationships(StringBuilder mermaid) {
    for (Relationship rel : graph.getRelationships()) {
      Relationship.Type type = rel.getType();
      if (type == Relationship.Type.CONTAINS
          || type == Relationship.Type.IMPLEMENTS
          || type == Relationship.Type.IMPLEMENTED_BY
          || type == Relationship.Type.INJECTS
          || type == Relationship.Type.BINDS_TO) {
        String sourceId = sanitizeId(rel.getSourceId());
        String targetId = sanitizeId(rel.getTargetId());
        String relType = type.toString();
        mermaid.append(String.format("  %s -->|%s| %s\n", sourceId, relType, targetId));
      }
    }
  }

  private void renderRelationshipsByType(StringBuilder mermaid, Relationship.Type type) {
    for (Relationship rel : graph.getRelationshipsByType(type)) {
      String sourceId = sanitizeId(rel.getSourceId());
      String targetId = sanitizeId(rel.getTargetId());
      String relType = type.toString();
      mermaid.append(String.format("  %s -->|%s| %s\n", sourceId, relType, targetId));
    }
  }

  private boolean isCrossLayer(String sourceId, String targetId) {
    Node source = graph.getNode(sourceId);
    Node target = graph.getNode(targetId);
    if (source == null || target == null) {
      return false;
    }

    String sourceLayer =
        source.getProperty("layer") != null ? source.getProperty("layer").toString() : "";
    String targetLayer =
        target.getProperty("layer") != null ? target.getProperty("layer").toString() : "";

    return !sourceLayer.isEmpty() && !targetLayer.isEmpty() && !sourceLayer.equals(targetLayer);
  }

  private Map<String, Node> getNodesByType(String type) {
    return graph.getNodes().stream()
        .filter(n -> n.getType().equals(type))
        .collect(Collectors.toMap(Node::getId, n -> n));
  }

  private String sanitizeId(String id) {
    return id.replace(":", "_").replace(".", "_").replace("-", "_").replace("@", "_");
  }

  private String getNodeInfo(Node node) {
    String info = node.getType();
    if (node.getType().equals("Method")) {
      String signature =
          node.getProperty("signature") != null ? node.getProperty("signature").toString() : "";
      if (signature.length() > 30) {
        signature = signature.substring(0, 27) + "...";
      }
      info = "Method: " + signature;
    }
    return info;
  }
}
