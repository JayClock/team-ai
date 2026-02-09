package com.businessdrivenai.domain.description;

import static org.junit.jupiter.api.Assertions.*;

import com.businessdrivenai.archtype.JsonBlob;
import com.businessdrivenai.archtype.Ref;
import org.junit.jupiter.api.Test;

public class NodeDescriptionTest {

  @Test
  void should_create_node_description() throws Exception {
    JsonBlob styleConfig =
        new JsonBlob(
            "{\"backgroundColor\":\"#ff6b6b\",\"textColor\":\"#ffffff\",\"fontSize\":14,\"collapsed\":false,\"hiddenAttributes\":[]}");
    JsonBlob localData = new JsonBlob("{\"content\":\"\",\"color\":null,\"type\":null}");
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
  void should_support_pure_drawing_node() throws Exception {
    JsonBlob styleConfig =
        new JsonBlob(
            "{\"backgroundColor\":\"#ffd93d\",\"textColor\":\"#000000\",\"fontSize\":12,\"collapsed\":false,\"hiddenAttributes\":[]}");
    JsonBlob localData =
        new JsonBlob("{\"content\":\"这里逻辑还需要再讨论\",\"color\":\"#ffd93d\",\"type\":\"sticky-note\"}");
    NodeDescription description =
        new NodeDescription(
            "sticky-note", null, null, 150.0, 150.0, 200, 200, styleConfig, localData);

    assertEquals("sticky-note", description.type());
    assertNull(description.logicalEntity());
    assertNull(description.parent());
    assertTrue(localData.json().contains("这里逻辑还需要再讨论"));
  }

  @Test
  void should_support_null_parent_id() throws Exception {
    JsonBlob styleConfig =
        new JsonBlob(
            "{\"backgroundColor\":\"#ffffff\",\"textColor\":\"#000000\",\"fontSize\":14,\"collapsed\":false,\"hiddenAttributes\":[]}");
    JsonBlob localData = new JsonBlob("{\"content\":\"\",\"color\":null,\"type\":null}");
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
  void should_support_null_dimensions() throws Exception {
    JsonBlob styleConfig =
        new JsonBlob(
            "{\"backgroundColor\":\"#ffffff\",\"textColor\":\"#000000\",\"fontSize\":14,\"collapsed\":false,\"hiddenAttributes\":[]}");
    JsonBlob localData = new JsonBlob("{\"content\":\"\",\"color\":null,\"type\":null}");
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
  void should_support_different_node_types() throws Exception {
    JsonBlob styleConfig =
        new JsonBlob(
            "{\"backgroundColor\":\"#ffffff\",\"textColor\":\"#000000\",\"fontSize\":14,\"collapsed\":false,\"hiddenAttributes\":[]}");
    JsonBlob localData = new JsonBlob("{\"content\":\"\",\"color\":null,\"type\":null}");

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
  void should_support_style_override() throws Exception {
    JsonBlob styleConfig =
        new JsonBlob(
            "{\"backgroundColor\":\"#ff0000\",\"textColor\":\"#00ff00\",\"fontSize\":16,\"collapsed\":true,\"hiddenAttributes\":[\"createdAt\",\"updatedAt\"]}");
    JsonBlob localData = new JsonBlob("{\"content\":\"\",\"color\":null,\"type\":null}");
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

    assertTrue(styleConfig.json().contains("\"collapsed\":true"));
    assertTrue(styleConfig.json().contains("hiddenAttributes"));
  }
}
