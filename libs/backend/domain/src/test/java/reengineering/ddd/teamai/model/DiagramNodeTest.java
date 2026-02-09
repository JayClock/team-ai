package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.HasOne;
import reengineering.ddd.archtype.JsonBlob;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.NodeDescription;

public class DiagramNodeTest {
  private DiagramNode node;
  private NodeDescription description;

  @BeforeEach
  public void setUp() throws Exception {
    description =
        new NodeDescription(
            "class-node",
            new Ref<>("logical-entity-1"),
            new Ref<>("parent-1"),
            100.0,
            200.0,
            300,
            200,
            new JsonBlob(
                "{\"backgroundColor\":\"#ff6b6b\",\"textColor\":\"#ffffff\",\"fontSize\":14,\"collapsed\":false,\"hiddenAttributes\":[]}"),
            new JsonBlob("{\"content\":\"\",\"color\":null,\"type\":null}"));
    node = new DiagramNode("node-1", description, mock(HasOne.class));
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
      JsonBlob styleConfig = node.getDescription().styleConfig();
      assertNotNull(styleConfig);
      assertTrue(styleConfig.json().contains("#ff6b6b"));
      assertTrue(styleConfig.json().contains("\"fontSize\":14"));
      assertTrue(styleConfig.json().contains("\"collapsed\":false"));
    }

    @Test
    void should_return_local_data() {
      JsonBlob localData = node.getDescription().localData();
      assertNotNull(localData);
      assertTrue(localData.json().contains("\"content\":\"\""));
    }
  }

  @Nested
  class PureDrawingNode {
    @Test
    void should_support_pure_drawing_node() throws Exception {
      NodeDescription stickyNoteDesc =
          new NodeDescription(
              "sticky-note",
              null,
              null,
              150.0,
              150.0,
              200,
              200,
              new JsonBlob(
                  "{\"backgroundColor\":\"#ffd93d\",\"textColor\":\"#000000\",\"fontSize\":12,\"collapsed\":false,\"hiddenAttributes\":[]}"),
              new JsonBlob(
                  "{\"content\":\"这里逻辑还需要再讨论\",\"color\":\"#ffd93d\",\"type\":\"sticky-note\"}"));

      DiagramNode stickyNode = new DiagramNode("sticky-1", stickyNoteDesc, mock(HasOne.class));

      assertNull(stickyNode.getDescription().logicalEntity());
      assertTrue(stickyNode.getDescription().localData().json().contains("这里逻辑还需要再讨论"));
    }
  }

  @Nested
  class StyleConfigOverride {
    @Test
    void should_support_style_override() throws Exception {
      NodeDescription nodeWithOverride =
          new NodeDescription(
              "class-node",
              new Ref<>("logical-entity-1"),
              null,
              0,
              0,
              200,
              150,
              new JsonBlob(
                  "{\"backgroundColor\":\"#ff0000\",\"textColor\":\"#00ff00\",\"fontSize\":16,\"collapsed\":true,\"hiddenAttributes\":[\"createdAt\",\"updatedAt\"]}"),
              new JsonBlob("{\"content\":\"\",\"color\":null,\"type\":null}"));

      DiagramNode overrideNode =
          new DiagramNode("node-override", nodeWithOverride, mock(HasOne.class));

      JsonBlob styleConfig = overrideNode.getDescription().styleConfig();
      assertTrue(styleConfig.json().contains("#ff0000"));
      assertTrue(styleConfig.json().contains("#00ff00"));
      assertTrue(styleConfig.json().contains("\"fontSize\":16"));
      assertTrue(styleConfig.json().contains("\"collapsed\":true"));
      assertTrue(styleConfig.json().contains("hiddenAttributes"));
    }
  }

  @Nested
  class DifferentNodeTypes {
    @Test
    void should_support_class_node_type() throws Exception {
      NodeDescription classNodeDesc =
          new NodeDescription(
              "class-node",
              new Ref<>("entity-1"),
              null,
              0,
              0,
              200,
              150,
              new JsonBlob(
                  "{\"backgroundColor\":\"#ffffff\",\"textColor\":\"#000000\",\"fontSize\":14,\"collapsed\":false,\"hiddenAttributes\":[]}"),
              new JsonBlob("{\"content\":\"\",\"color\":null,\"type\":null}"));

      DiagramNode classNode = new DiagramNode("class-1", classNodeDesc, mock(HasOne.class));
      assertEquals("class-node", classNode.getDescription().type());
    }

    @Test
    void should_support_group_node_type() throws Exception {
      NodeDescription groupNodeDesc =
          new NodeDescription(
              "group",
              null,
              null,
              0,
              0,
              400,
              300,
              new JsonBlob(
                  "{\"backgroundColor\":\"#f0f0f0\",\"textColor\":\"#000000\",\"fontSize\":14,\"collapsed\":false,\"hiddenAttributes\":[]}"),
              new JsonBlob("{\"content\":\"\",\"color\":null,\"type\":null}"));

      DiagramNode groupNode = new DiagramNode("group-1", groupNodeDesc, mock(HasOne.class));
      assertEquals("group", groupNode.getDescription().type());
    }
  }
}
