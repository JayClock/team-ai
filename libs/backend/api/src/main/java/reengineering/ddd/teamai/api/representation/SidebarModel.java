package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;

public class SidebarModel extends RepresentationModel<SidebarModel> {
  @JsonProperty private List<Section> sections;

  private SidebarModel(List<Section> sections) {
    this.sections = sections;
  }

  public static SidebarModel project(
      String sidebarPath, String diagramsPath, String conversationsPath) {
    SidebarModel model =
        new SidebarModel(
            List.of(
                new Section(
                    "PROJECT",
                    "project",
                    true,
                    List.of(
                        new Item("Diagrams", diagramsPath, "workflow"),
                        new Item("Conversations", conversationsPath, "messages-square")))));
    model.add(Link.of(sidebarPath).withSelfRel());
    return model;
  }

  public record Section(
      @JsonProperty("title") String title,
      @JsonProperty("key") String key,
      @JsonProperty("defaultOpen") boolean defaultOpen,
      @JsonProperty("items") List<Item> items) {}

  public record Item(
      @JsonProperty("label") String label,
      @JsonProperty("path") String path,
      @JsonProperty("icon") String icon) {}
}
