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

    Object entity = responseContext.getEntity();
    if (entity == null) {
      return;
    }

    ObjectNode root = objectMapper.valueToTree(entity);
    if (root == null) {
      return;
    }

    if (includeSidebar) {
      injectSidebar(root, uriInfo, projectId);
    }
    if (includeBreadcrumb) {
      injectBreadcrumb(root, uriInfo, projectId);
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

  private void injectSidebar(ObjectNode root, UriInfo uriInfo, String projectId) {
    String diagramsPath = ApiTemplates.diagrams(uriInfo).build(projectId).getPath();
    String conversationsPath = ApiTemplates.conversations(uriInfo).build(projectId).getPath();
    String sidebarPath = ApiTemplates.sidebar(uriInfo).build(projectId).getPath();

    ObjectNode links = ensureObject(root, "_links");
    if (!links.has("sidebar")) {
      ObjectNode sidebarLink = objectMapper.createObjectNode();
      sidebarLink.put("href", sidebarPath);
      links.set("sidebar", sidebarLink);
    }

    ObjectNode embedded = ensureObject(root, "_embedded");
    if (!embedded.has("sidebar")) {
      embedded.set(
          "sidebar",
          objectMapper.valueToTree(
              SidebarModel.project(sidebarPath, diagramsPath, conversationsPath)));
    }
  }

  private void injectBreadcrumb(ObjectNode root, UriInfo uriInfo, String projectId) {
    String breadcrumbPath = ApiTemplates.breadcrumb(uriInfo).build(projectId).getPath();

    ObjectNode links = ensureObject(root, "_links");
    if (!links.has("breadcrumb")) {
      ObjectNode breadcrumbLink = objectMapper.createObjectNode();
      breadcrumbLink.put("href", breadcrumbPath);
      links.set("breadcrumb", breadcrumbLink);
    }

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
}
