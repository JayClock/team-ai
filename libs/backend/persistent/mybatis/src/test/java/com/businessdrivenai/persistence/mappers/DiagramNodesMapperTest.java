package com.businessdrivenai.persistence.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.businessdrivenai.archtype.JsonBlob;
import com.businessdrivenai.domain.description.LogicalEntityDescription;
import com.businessdrivenai.domain.description.NodeDescription;
import com.businessdrivenai.domain.model.DiagramNode;
import com.businessdrivenai.persistence.TestContainerConfig;
import com.businessdrivenai.persistence.mybatis.mappers.DiagramNodesMapper;
import com.businessdrivenai.persistence.support.IdHolder;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;

@MybatisTest
@Import(TestContainerConfig.class)
public class DiagramNodesMapperTest {
  private static final ObjectMapper objectMapper = new ObjectMapper();

  @Inject private TestDataMapper testData;
  @Inject private DiagramNodesMapper nodesMapper;

  private final int userId = id();
  private final int projectId = id();
  private final int diagramId = id();
  private final int nodeId = id();
  private final int logicalEntityId = id();
  private final int parentNodeId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "Test Project" + projectId);
    testData.insertProjectMember(projectId, userId);
    testData.insertLogicalEntity(
        logicalEntityId,
        projectId,
        LogicalEntityDescription.Type.CONTEXT,
        null,
        "TestEntity",
        "Test Entity Label",
        "{}",
        "ACTIVE");
    testData.insertDiagram(
        diagramId,
        projectId,
        "Test Diagram" + diagramId,
        "CLASS_DIAGRAM",
        "{\"x\":0,\"y\":0,\"zoom\":1}");
    // Insert parent node first (with null refs)
    testData.insertDiagramNode(
        parentNodeId, diagramId, "group-node", null, null, 0.0, 0.0, 800, 600, null, null);
    // Insert child node with non-null logicalEntityId and parentId
    testData.insertDiagramNode(
        nodeId,
        diagramId,
        "class-node",
        logicalEntityId,
        parentNodeId,
        100.0,
        200.0,
        300,
        400,
        "{\"backgroundColor\":\"#ff0000\",\"textColor\":\"#ffffff\",\"fontSize\":14,\"collapsed\":false,\"hiddenAttributes\":[]}",
        "{\"content\":\"Node content\",\"color\":\"#ff6b6b\",\"type\":\"sticky-note\"}");
  }

  @Test
  void should_find_node_by_diagram_and_id() {
    DiagramNode node = nodesMapper.findNodeByDiagramAndId(diagramId, nodeId);
    assertEquals(String.valueOf(nodeId), node.getIdentity());
    assertEquals("class-node", node.getDescription().type());
    assertEquals(100.0, node.getDescription().positionX());
    assertEquals(200.0, node.getDescription().positionY());
    assertEquals(300, node.getDescription().width());
    assertEquals(400, node.getDescription().height());
  }

  @Test
  void should_parse_style_config_from_jsonb() throws Exception {
    DiagramNode node = nodesMapper.findNodeByDiagramAndId(diagramId, nodeId);
    assertNotNull(node.getDescription().styleConfig());
    Map<String, Object> styleConfig =
        objectMapper.readValue(
            node.getDescription().styleConfig().json(),
            new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
    assertEquals("#ff0000", styleConfig.get("backgroundColor"));
    assertEquals("#ffffff", styleConfig.get("textColor"));
    assertEquals(14, styleConfig.get("fontSize"));
    assertEquals(false, styleConfig.get("collapsed"));
  }

  @Test
  void should_parse_local_data_from_jsonb() throws Exception {
    DiagramNode node = nodesMapper.findNodeByDiagramAndId(diagramId, nodeId);
    assertNotNull(node.getDescription().localData());
    Map<String, Object> localData =
        objectMapper.readValue(
            node.getDescription().localData().json(),
            new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
    assertEquals("Node content", localData.get("content"));
    assertEquals("#ff6b6b", localData.get("color"));
    assertEquals("sticky-note", localData.get("type"));
  }

  @Test
  void should_parse_non_null_refs_correctly() {
    DiagramNode node = nodesMapper.findNodeByDiagramAndId(diagramId, nodeId);
    assertEquals(String.valueOf(logicalEntityId), node.getDescription().logicalEntity().id());
    assertEquals(String.valueOf(parentNodeId), node.getDescription().parent().id());
  }

  @Test
  public void should_add_node_to_database() throws Exception {
    IdHolder idHolder = new IdHolder();
    String styleConfigJson =
        objectMapper.writeValueAsString(
            Map.of(
                "backgroundColor",
                "#00ff00",
                "textColor",
                "#000000",
                "fontSize",
                12,
                "collapsed",
                true,
                "hiddenAttributes",
                List.of("attr1", "attr2")));
    String localDataJson =
        objectMapper.writeValueAsString(
            Map.of(
                "content", "Test content",
                "color", "#00ff00",
                "type", "sticky-note"));
    NodeDescription description =
        new NodeDescription(
            "sticky-note",
            null,
            null,
            50.0,
            150.0,
            200,
            300,
            new JsonBlob(styleConfigJson),
            new JsonBlob(localDataJson));
    nodesMapper.insertNode(idHolder, diagramId, description);

    DiagramNode node = nodesMapper.findNodeByDiagramAndId(diagramId, idHolder.id());
    assertEquals("sticky-note", node.getDescription().type());
    assertEquals(50.0, node.getDescription().positionX());
    assertEquals(150.0, node.getDescription().positionY());
    assertEquals(200, node.getDescription().width());
    assertEquals(300, node.getDescription().height());
  }

  @Test
  public void should_count_nodes_by_diagram() {
    int count = nodesMapper.countNodesByDiagram(diagramId);
    assertEquals(2, count);
  }

  @Test
  public void should_find_nodes_by_diagram_id() {
    List<DiagramNode> nodes = nodesMapper.findNodesByDiagramId(diagramId);
    assertEquals(2, nodes.size());
  }
}
