package reengineering.ddd.teamai.description;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;

public class NodeStyleConfigTest {

  @Test
  void should_create_node_style_config() {
    NodeStyleConfig config =
        new NodeStyleConfig("#ff6b6b", "#ffffff", 14, false, List.of("createdAt"));

    assertEquals("#ff6b6b", config.backgroundColor());
    assertEquals("#ffffff", config.textColor());
    assertEquals(14, config.fontSize());
    assertFalse(config.collapsed());
    assertEquals(1, config.hiddenAttributes().size());
    assertTrue(config.hiddenAttributes().contains("createdAt"));
  }

  @Test
  void should_support_null_values() {
    NodeStyleConfig config = new NodeStyleConfig(null, null, null, false, List.of());

    assertNull(config.backgroundColor());
    assertNull(config.textColor());
    assertNull(config.fontSize());
    assertFalse(config.collapsed());
    assertTrue(config.hiddenAttributes().isEmpty());
  }

  @Test
  void should_support_multiple_hidden_attributes() {
    NodeStyleConfig config =
        new NodeStyleConfig(
            "#ff6b6b", "#ffffff", 14, false, List.of("createdAt", "updatedAt", "deletedAt"));

    assertEquals(3, config.hiddenAttributes().size());
    assertTrue(
        config.hiddenAttributes().containsAll(List.of("createdAt", "updatedAt", "deletedAt")));
  }

  @Test
  void should_support_collapsed_state() {
    NodeStyleConfig config = new NodeStyleConfig("#ff6b6b", "#ffffff", 14, true, List.of());

    assertTrue(config.collapsed());
  }

  @Test
  void should_support_different_font_sizes() {
    NodeStyleConfig smallFont = new NodeStyleConfig(null, null, 12, false, List.of());
    NodeStyleConfig largeFont = new NodeStyleConfig(null, null, 18, false, List.of());

    assertEquals(12, smallFont.fontSize());
    assertEquals(18, largeFont.fontSize());
  }
}
