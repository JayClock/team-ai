package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.LocalNodeData;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.NodeStyleConfig;

public class DiagramNodeTest {
  private DiagramNode node;
  private NodeDescription description;

  @BeforeEach
  public void setUp() {
    description =
        new NodeDescription(
            "class-node",
            new Ref<>("logical-entity-1"),
            new Ref<>("parent-1"),
            100.0,
            200.0,
            300,
            200,
            new NodeStyleConfig("#ff6b6b", "#ffffff", 14, false, java.util.List.of()),
            new LocalNodeData("", null, null));
    node = new DiagramNode("node-1", "diagram-1", description);
  }

  @Nested
  class Identity {
    @Test
    void should_return_identity() {
      assertEquals("node-1", node.getIdentity());
    }
  }

  @Nested
  class Description {
    @Test
    void should_return_description() {
      assertEquals(description, node.getDescription());
    }

    @Test
    void should_return_node_type() {
      assertEquals("class-node", node.getDescription().type());
    }

    @Test
    void should_return_logical_entity_id() {
      assertEquals("logical-entity-1", node.getDescription().logicalEntity().id());
    }

    @Test
    void should_return_parent_id() {
      assertEquals("parent-1", node.getDescription().parent().id());
    }

    @Test
    void should_return_position() {
      assertEquals(100.0, node.getDescription().positionX());
      assertEquals(200.0, node.getDescription().positionY());
    }

    @Test
    void should_return_size() {
      assertEquals(300, node.getDescription().width());
      assertEquals(200, node.getDescription().height());
    }

    @Test
    void should_return_style_config() {
      NodeStyleConfig styleConfig = node.getDescription().styleConfig();
      assertNotNull(styleConfig);
      assertEquals("#ff6b6b", styleConfig.backgroundColor());
      assertEquals("#ffffff", styleConfig.textColor());
      assertEquals(14, styleConfig.fontSize());
      assertFalse(styleConfig.collapsed());
    }

    @Test
    void should_return_local_data() {
      LocalNodeData localData = node.getDescription().localData();
      assertNotNull(localData);
      assertEquals("", localData.content());
    }
  }

  @Nested
  class DiagramId {
    @Test
    void should_return_diagram_id() {
      assertEquals("diagram-1", node.getDiagramId());
    }
  }

  @Nested
  class PureDrawingNode {
    @Test
    void should_support_pure_drawing_node() {
      NodeDescription stickyNoteDesc =
          new NodeDescription(
              "sticky-note",
              null,
              null,
              150.0,
              150.0,
              200,
              200,
              new NodeStyleConfig("#ffd93d", "#000000", 12, false, java.util.List.of()),
              new LocalNodeData("这里逻辑还需要再讨论", "#ffd93d", "sticky-note"));

      DiagramNode stickyNode = new DiagramNode("sticky-1", "diagram-1", stickyNoteDesc);

      assertNull(stickyNode.getDescription().logicalEntity());
      assertEquals("这里逻辑还需要再讨论", stickyNode.getDescription().localData().content());
    }
  }

  @Nested
  class StyleConfigOverride {
    @Test
    void should_support_style_override() {
      NodeDescription nodeWithOverride =
          new NodeDescription(
              "class-node",
              new Ref<>("logical-entity-1"),
              null,
              0,
              0,
              200,
              150,
              new NodeStyleConfig(
                  "#ff0000", "#00ff00", 16, true, java.util.List.of("createdAt", "updatedAt")),
              new LocalNodeData("", null, null));

      DiagramNode overrideNode = new DiagramNode("node-override", "diagram-1", nodeWithOverride);

      NodeStyleConfig styleConfig = overrideNode.getDescription().styleConfig();
      assertEquals("#ff0000", styleConfig.backgroundColor());
      assertEquals("#00ff00", styleConfig.textColor());
      assertEquals(16, styleConfig.fontSize());
      assertTrue(styleConfig.collapsed());
      assertEquals(2, styleConfig.hiddenAttributes().size());
      assertTrue(styleConfig.hiddenAttributes().contains("createdAt"));
    }
  }

  @Nested
  class DifferentNodeTypes {
    @Test
    void should_support_class_node_type() {
      NodeDescription classNodeDesc =
          new NodeDescription(
              "class-node",
              new Ref<>("entity-1"),
              null,
              0,
              0,
              200,
              150,
              new NodeStyleConfig("#ffffff", "#000000", 14, false, java.util.List.of()),
              new LocalNodeData("", null, null));

      DiagramNode classNode = new DiagramNode("class-1", "diagram-1", classNodeDesc);
      assertEquals("class-node", classNode.getDescription().type());
    }

    @Test
    void should_support_group_node_type() {
      NodeDescription groupNodeDesc =
          new NodeDescription(
              "group",
              null,
              null,
              0,
              0,
              400,
              300,
              new NodeStyleConfig("#f0f0f0", "#000000", 14, false, java.util.List.of()),
              new LocalNodeData("", null, null));

      DiagramNode groupNode = new DiagramNode("group-1", "diagram-1", groupNodeDesc);
      assertEquals("group", groupNode.getDescription().type());
    }
  }
}
