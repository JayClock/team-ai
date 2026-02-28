package reengineering.ddd.teamai.api.preference;

import jakarta.ws.rs.container.ContainerRequestContext;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public final class LayoutPreference {
  public static final String PREFER_HEADER = "Prefer";
  public static final String REQUEST_PROPERTY_LAYOUTS = "teamai.prefer.layouts";
  public static final String SIDEBAR = "sidebar";
  public static final Set<String> SUPPORTED_LAYOUTS = Set.of(SIDEBAR);

  private LayoutPreference() {}

  public static Set<String> parseLayouts(List<String> preferHeaders) {
    if (preferHeaders == null || preferHeaders.isEmpty()) {
      return Collections.emptySet();
    }

    Set<String> layouts = new LinkedHashSet<>();
    for (String header : preferHeaders) {
      if (header == null || header.isBlank()) {
        continue;
      }

      for (String token : header.split(",")) {
        if (token == null || token.isBlank()) {
          continue;
        }

        for (String segment : token.split(";")) {
          int equalIndex = segment.indexOf('=');
          if (equalIndex < 0) {
            continue;
          }

          String key = segment.substring(0, equalIndex).trim();
          if (!"layout".equalsIgnoreCase(key)) {
            continue;
          }

          String value = segment.substring(equalIndex + 1).trim();
          if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
            value = value.substring(1, value.length() - 1).trim();
          }
          if (!value.isEmpty()) {
            layouts.add(value.toLowerCase());
          }
        }
      }
    }

    return layouts.isEmpty() ? Collections.emptySet() : Collections.unmodifiableSet(layouts);
  }

  public static Set<String> findUnsupportedLayouts(Set<String> layouts) {
    if (layouts == null || layouts.isEmpty()) {
      return Collections.emptySet();
    }

    Set<String> unsupported = new LinkedHashSet<>();
    for (String layout : layouts) {
      if (!SUPPORTED_LAYOUTS.contains(layout)) {
        unsupported.add(layout);
      }
    }
    return unsupported.isEmpty()
        ? Collections.emptySet()
        : Collections.unmodifiableSet(unsupported);
  }

  @SuppressWarnings("unchecked")
  public static boolean hasLayout(ContainerRequestContext requestContext, String layoutName) {
    if (requestContext == null || layoutName == null || layoutName.isBlank()) {
      return false;
    }
    String expected = layoutName.toLowerCase();
    Object layouts = requestContext.getProperty(REQUEST_PROPERTY_LAYOUTS);
    if (layouts instanceof Set<?>) {
      return ((Set<String>) layouts).contains(expected);
    }

    String prefer = requestContext.getHeaderString(PREFER_HEADER);
    if (prefer == null || prefer.isBlank()) {
      return false;
    }
    return parseLayouts(List.of(prefer)).contains(expected);
  }
}
