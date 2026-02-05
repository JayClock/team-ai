package reengineering.ddd.teamai.description;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

public class LocalNodeDataTest {

  @Test
  void should_create_local_node_data() {
    LocalNodeData data = new LocalNodeData("这里是便利贴内容", "#ffd93d", "sticky-note");

    assertEquals("这里是便利贴内容", data.content());
    assertEquals("#ffd93d", data.color());
    assertEquals("sticky-note", data.type());
  }

  @Test
  void should_support_null_values() {
    LocalNodeData data = new LocalNodeData("", null, null);

    assertEquals("", data.content());
    assertNull(data.color());
    assertNull(data.type());
  }

  @Test
  void should_support_sticky_note_type() {
    LocalNodeData stickyNote = new LocalNodeData("TODO: 实现支付功能", "#ffd93d", "sticky-note");

    assertEquals("sticky-note", stickyNote.type());
    assertEquals("#ffd93d", stickyNote.color());
  }

  @Test
  void should_support_annotation_box_type() {
    LocalNodeData annotation = new LocalNodeData("这是需要讨论的逻辑", "#ff6b6b", "annotation");

    assertEquals("annotation", annotation.type());
    assertEquals("#ff6b6b", annotation.color());
  }

  @Test
  void should_support_empty_content() {
    LocalNodeData emptyData = new LocalNodeData("", "#ffffff", "sticky-note");

    assertEquals("", emptyData.content());
    assertEquals("#ffffff", emptyData.color());
  }
}
