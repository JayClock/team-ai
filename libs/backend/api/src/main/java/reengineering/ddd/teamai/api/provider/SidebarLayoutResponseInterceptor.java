package reengineering.ddd.teamai.api.provider;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.ext.Provider;
import java.io.IOException;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.api.preference.LayoutPreference;
import reengineering.ddd.teamai.api.representation.BreadcrumbModel;
import reengineering.ddd.teamai.api.representation.SidebarModel;

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
    boolean includeSidebar = LayoutPreference.hasLayout(requestContext, LayoutPreference.SIDEBAR);
    boolean includeBreadcrumb =
        LayoutPreference.hasLayout(requestContext, LayoutPreference.BREADCRUMB);
    if (!includeSidebar && !includeBreadcrumb) {
      return;
    }

    UriInfo uriInfo = requestContext.getUriInfo();
    String projectId = extractProjectId(uriInfo);
    if (projectId == null) {
      return;
    }
    String userId = extractUserId(requestContext);

    Object entity = responseContext.getEntity();
    if (entity == null) {
      return;
    }

    ObjectNode root = objectMapper.valueToTree(entity);
    if (root == null) {
      return;
    }

    injectContextLinks(root, uriInfo, projectId, userId);

    if (includeSidebar) {
      injectSidebar(root, uriInfo, projectId);
    }
    if (includeBreadcrumb) {
      injectBreadcrumb(root, uriInfo);
    }
    responseContext.setEntity(root);
  }

  private static String extractProjectId(UriInfo uriInfo) {
    String projectId = uriInfo.getPathParameters().getFirst("projectId");
    if (projectId == null || projectId.isBlank()) {
      return null;
    }
    return projectId;
  }

  private static String extractUserId(ContainerRequestContext requestContext) {
    if (requestContext.getSecurityContext() == null
        || requestContext.getSecurityContext().getUserPrincipal() == null) {
      return null;
    }
    String userId = requestContext.getSecurityContext().getUserPrincipal().getName();
    if (userId == null || userId.isBlank()) {
      return null;
    }
    return userId;
  }

  private void injectContextLinks(
      ObjectNode root, UriInfo uriInfo, String projectId, String userId) {
    String projectPath = ApiTemplates.project(uriInfo).build(projectId).getPath();

    ObjectNode links = ensureObject(root, "_links");
    putLinkIfAbsent(links, "project", projectPath);
    if (userId != null) {
      String userPath = ApiTemplates.user(uriInfo).build(userId).getPath();
      putLinkIfAbsent(links, "user", userPath);
    }
  }

  private void injectSidebar(ObjectNode root, UriInfo uriInfo, String projectId) {
    String diagramsPath = ApiTemplates.diagrams(uriInfo).build(projectId).getPath();
    String conversationsPath = ApiTemplates.conversations(uriInfo).build(projectId).getPath();
    String sidebarPath = ApiTemplates.project(uriInfo).build(projectId).getPath() + "/sidebar";

    ObjectNode links = ensureObject(root, "_links");
    putLinkIfAbsent(links, "sidebar", sidebarPath);

    ObjectNode embedded = ensureObject(root, "_embedded");
    if (!embedded.has("sidebar")) {
      embedded.set(
          "sidebar",
          objectMapper.valueToTree(
              SidebarModel.project(sidebarPath, diagramsPath, conversationsPath)));
    }
  }

  private void injectBreadcrumb(ObjectNode root, UriInfo uriInfo) {
    String breadcrumbPath = uriInfo.getAbsolutePathBuilder().path("breadmenu").build().getPath();

    ObjectNode links = ensureObject(root, "_links");
    putLinkIfAbsent(links, "breadcrumb", breadcrumbPath);

    ObjectNode embedded = ensureObject(root, "_embedded");
    if (!embedded.has("breadcrumb")) {
      embedded.set(
          "breadcrumb",
          objectMapper.valueToTree(BreadcrumbModel.fromUriInfo(breadcrumbPath, uriInfo)));
    }
  }

  private static ObjectNode ensureObject(ObjectNode root, String fieldName) {
    if (root.has(fieldName) && root.get(fieldName).isObject()) {
      return (ObjectNode) root.get(fieldName);
    }
    ObjectNode object = root.objectNode();
    root.set(fieldName, object);
    return object;
  }

  private void putLinkIfAbsent(ObjectNode links, String rel, String href) {
    if (links.has(rel)) {
      return;
    }
    ObjectNode link = objectMapper.createObjectNode();
    link.put("href", href);
    links.set(rel, link);
  }
}
