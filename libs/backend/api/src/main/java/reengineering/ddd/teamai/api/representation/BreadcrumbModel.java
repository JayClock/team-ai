package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.ArrayList;
import java.util.List;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;

public class BreadcrumbModel extends RepresentationModel<BreadcrumbModel> {
  @JsonProperty private List<Item> items;

  private BreadcrumbModel(List<Item> items) {
    this.items = items;
  }

  public static BreadcrumbModel fromUriInfo(String breadcrumbPath, UriInfo uriInfo) {
    List<String> segments =
        uriInfo.getPathSegments().stream().map(segment -> segment.getPath()).toList();
    String basePath = trimTrailingSlash(uriInfo.getBaseUri().getPath());

    List<Item> items = new ArrayList<>();
    String currentPath = basePath;
    for (String segment : segments) {
      if (segment == null || segment.isBlank()) {
        continue;
      }
      currentPath += "/" + segment;
      items.add(new Item(titleCaseSegment(segment), currentPath));
    }

    BreadcrumbModel model = new BreadcrumbModel(items);
    model.add(Link.of(breadcrumbPath).withSelfRel());
    return model;
  }

  private static String trimTrailingSlash(String value) {
    if (value == null || value.isBlank()) {
      return "";
    }
    return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
  }

  private static String titleCaseSegment(String segment) {
    String[] words = segment.split("-");
    StringBuilder builder = new StringBuilder();
    for (int i = 0; i < words.length; i += 1) {
      String word = words[i];
      if (word.isEmpty()) {
        continue;
      }
      if (builder.length() > 0) {
        builder.append(" ");
      }
      builder.append(Character.toUpperCase(word.charAt(0)));
      if (word.length() > 1) {
        builder.append(word.substring(1));
      }
    }
    return builder.toString();
  }

  public record Item(@JsonProperty("label") String label, @JsonProperty("path") String path) {}
}
