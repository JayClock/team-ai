package reengineering.ddd.teamai.api.provider;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.ext.Provider;
import java.io.IOException;
import java.util.List;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.api.preference.LayoutPreference;

@Component
@Provider
public class SidebarLayoutResponseInterceptor implements ContainerResponseFilter {
  private final ObjectMapper objectMapper;

  public SidebarLayoutResponseInterceptor(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  @Override
  public void filter(
      ContainerRequestContext requestContext, ContainerResponseContext responseContext)
      throws IOException {
    if (!LayoutPreference.hasLayout(requestContext, LayoutPreference.SIDEBAR)) {
      return;
    }

    String projectId = extractProjectId(requestContext);
    if (projectId == null) {
      return;
    }

    Object entity = responseContext.getEntity();
    if (entity == null) {
      return;
    }

    ObjectNode root = objectMapper.valueToTree(entity);
    if (root == null) {
      return;
    }

    injectSidebar(root, projectId);
    responseContext.setEntity(root);
  }

  private static String extractProjectId(ContainerRequestContext requestContext) {
    List<String> segments =
        requestContext.getUriInfo().getPathSegments().stream()
            .map(segment -> segment.getPath())
            .toList();
    for (int i = 0; i < segments.size() - 1; i += 1) {
      if ("projects".equals(segments.get(i))) {
        String projectId = segments.get(i + 1);
        if (projectId != null && !projectId.isBlank()) {
          return projectId;
        }
      }
    }
    return null;
  }

  private void injectSidebar(ObjectNode root, String projectId) {
    String projectBasePath = "/api/projects/" + projectId;
    String sidebarPath = projectBasePath + "/sidebar";

    ObjectNode links = ensureObject(root, "_links");
    if (!links.has("sidebar")) {
      ObjectNode sidebarLink = objectMapper.createObjectNode();
      sidebarLink.put("href", sidebarPath);
      links.set("sidebar", sidebarLink);
    }

    ObjectNode embedded = ensureObject(root, "_embedded");
    if (!embedded.has("sidebar")) {
      embedded.set("sidebar", buildSidebarNode(projectBasePath, sidebarPath));
    }
  }

  private ObjectNode buildSidebarNode(String projectBasePath, String sidebarPath) {
    ObjectNode sidebar = objectMapper.createObjectNode();
    ObjectNode sidebarLinks = sidebar.putObject("_links");
    sidebarLinks.putObject("self").put("href", sidebarPath);

    ArrayNode sections = sidebar.putArray("sections");
    ObjectNode section = sections.addObject();
    section.put("title", "PROJECT");
    section.put("key", "project");
    section.put("defaultOpen", true);

    ArrayNode items = section.putArray("items");
    items
        .addObject()
        .put("label", "Diagrams")
        .put("path", projectBasePath + "/diagrams")
        .put("icon", "workflow");
    items
        .addObject()
        .put("label", "Conversations")
        .put("path", projectBasePath + "/conversations")
        .put("icon", "messages-square");
    return sidebar;
  }

  private static ObjectNode ensureObject(ObjectNode root, String fieldName) {
    if (root.has(fieldName) && root.get(fieldName).isObject()) {
      return (ObjectNode) root.get(fieldName);
    }
    ObjectNode object = root.objectNode();
    root.set(fieldName, object);
    return object;
  }
}
