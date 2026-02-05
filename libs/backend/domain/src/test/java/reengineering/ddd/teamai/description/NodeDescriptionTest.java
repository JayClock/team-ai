package reengineering.ddd.teamai.description;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.Ref;

public class NodeDescriptionTest {

  @Test
  void should_create_node_description() {
    NodeStyleConfig styleConfig = new NodeStyleConfig("#ff6b6b", "#ffffff", 14, false, List.of());
    LocalNodeData localData = new LocalNodeData("", null, null);
    NodeDescription description =
        new NodeDescription(
            "class-node",
            new Ref<>("logical-entity-1"),
            new Ref<>("parent-1"),
            100.0,
            200.0,
            300,
            200,
            styleConfig,
            localData);

    assertEquals("class-node", description.type());
    assertEquals("logical-entity-1", description.logicalEntity().id());
    assertEquals("parent-1", description.parent().id());
    assertEquals(100.0, description.positionX());
    assertEquals(200.0, description.positionY());
    assertEquals(300, description.width());
    assertEquals(200, description.height());
    assertEquals(styleConfig, description.styleConfig());
    assertEquals(localData, description.localData());
  }

  @Test
  void should_support_pure_drawing_node() {
    NodeStyleConfig styleConfig = new NodeStyleConfig("#ffd93d", "#000000", 12, false, List.of());
    LocalNodeData localData = new LocalNodeData("这里逻辑还需要再讨论", "#ffd93d", "sticky-note");
    NodeDescription description =
        new NodeDescription(
            "sticky-note", null, null, 150.0, 150.0, 200, 200, styleConfig, localData);

    assertEquals("sticky-note", description.type());
    assertNull(description.logicalEntity());
    assertNull(description.parent());
    assertEquals("这里逻辑还需要再讨论", description.localData().content());
  }

  @Test
  void should_support_null_parent_id() {
    NodeStyleConfig styleConfig = new NodeStyleConfig("#ffffff", "#000000", 14, false, List.of());
    LocalNodeData localData = new LocalNodeData("", null, null);
    NodeDescription description =
        new NodeDescription(
            "class-node",
            new Ref<>("logical-entity-1"),
            null,
            100.0,
            200.0,
            300,
            200,
            styleConfig,
            localData);

    assertNull(description.parent());
  }

  @Test
  void should_support_null_dimensions() {
    NodeStyleConfig styleConfig = new NodeStyleConfig("#ffffff", "#000000", 14, false, List.of());
    LocalNodeData localData = new LocalNodeData("", null, null);
    NodeDescription description =
        new NodeDescription(
            "class-node",
            new Ref<>("logical-entity-1"),
            null,
            0.0,
            0.0,
            null,
            null,
            styleConfig,
            localData);

    assertNull(description.width());
    assertNull(description.height());
  }

  @Test
  void should_support_different_node_types() {
    NodeStyleConfig styleConfig = new NodeStyleConfig("#ffffff", "#000000", 14, false, List.of());
    LocalNodeData localData = new LocalNodeData("", null, null);

    NodeDescription classNode =
        new NodeDescription(
            "class-node", new Ref<>("entity-1"), null, 0, 0, 200, 150, styleConfig, localData);
    NodeDescription stickyNote =
        new NodeDescription("sticky-note", null, null, 0, 0, 200, 200, styleConfig, localData);
    NodeDescription group =
        new NodeDescription("group", null, null, 0, 0, 400, 300, styleConfig, localData);

    assertEquals("class-node", classNode.type());
    assertEquals("sticky-note", stickyNote.type());
    assertEquals("group", group.type());
  }

  @Test
  void should_support_style_override() {
    NodeStyleConfig styleConfig =
        new NodeStyleConfig("#ff0000", "#00ff00", 16, true, List.of("createdAt", "updatedAt"));
    LocalNodeData localData = new LocalNodeData("", null, null);
    NodeDescription description =
        new NodeDescription(
            "class-node",
            new Ref<>("logical-entity-1"),
            null,
            0,
            0,
            200,
            150,
            styleConfig,
            localData);

    assertTrue(description.styleConfig().collapsed());
    assertEquals(2, description.styleConfig().hiddenAttributes().size());
  }
}
