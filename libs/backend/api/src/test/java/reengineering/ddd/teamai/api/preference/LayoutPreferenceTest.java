package reengineering.ddd.teamai.api.preference;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

public class LayoutPreferenceTest {
  @Test
  public void should_parse_layout_values_from_prefer_header() {
    Set<String> layouts =
        LayoutPreference.parseLayouts(
            List.of("respond-async, layout = sidebar; foo=bar, layout=\"toolbar\""));

    assertEquals(Set.of("sidebar", "toolbar"), layouts);
  }
}
