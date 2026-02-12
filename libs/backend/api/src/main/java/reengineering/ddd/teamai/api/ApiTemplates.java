package reengineering.ddd.teamai.api;

import jakarta.ws.rs.core.UriBuilder;
import jakarta.ws.rs.core.UriInfo;

public class ApiTemplates {
  public static UriBuilder user(UriInfo uriInfo) {
    return uriInfo
        .getBaseUriBuilder()
        .path(RootApi.class, "users")
        .path(UsersApi.class, "findById");
  }

  public static UriBuilder accounts(UriInfo uriInfo) {
    return user(uriInfo).path(UserApi.class, "accounts");
  }

  public static UriBuilder account(UriInfo uriInfo) {
    return accounts(uriInfo).path(AccountsApi.class, "findById");
  }

  public static UriBuilder projects(UriInfo uriInfo) {
    return uriInfo.getBaseUriBuilder().path(RootApi.class, "globalProjects");
  }

  public static UriBuilder project(UriInfo uriInfo) {
    return projects(uriInfo).path(ProjectsApi.class, "findById");
  }

  public static UriBuilder conversations(UriInfo uriInfo) {
    return project(uriInfo).path(ProjectApi.class, "conversations");
  }

  public static UriBuilder conversation(UriInfo uriInfo) {
    return conversations(uriInfo).path(ConversationsApi.class, "findById");
  }

  public static UriBuilder messages(UriInfo uriInfo) {
    return conversation(uriInfo).path(ConversationApi.class, "messages");
  }

  public static UriBuilder message(UriInfo uriInfo) {
    return messages(uriInfo).path("{message-id}");
  }

  public static UriBuilder logicalEntities(UriInfo uriInfo) {
    return project(uriInfo).path(ProjectApi.class, "logicalEntities");
  }

  public static UriBuilder logicalEntity(UriInfo uriInfo) {
    return logicalEntities(uriInfo).path(LogicalEntitiesApi.class, "findById");
  }

  public static UriBuilder diagrams(UriInfo uriInfo) {
    return project(uriInfo).path(ProjectApi.class, "diagrams");
  }

  public static UriBuilder diagram(UriInfo uriInfo) {
    return diagrams(uriInfo).path(DiagramsApi.class, "findById");
  }

  public static UriBuilder nodes(UriInfo uriInfo) {
    return diagram(uriInfo).path(DiagramApi.class, "nodes");
  }

  public static UriBuilder node(UriInfo uriInfo) {
    return nodes(uriInfo).path(NodesApi.class, "findById");
  }

  public static UriBuilder edges(UriInfo uriInfo) {
    return diagram(uriInfo).path(DiagramApi.class, "edges");
  }

  public static UriBuilder edge(UriInfo uriInfo) {
    return edges(uriInfo).path(EdgesApi.class, "findById");
  }

  public static UriBuilder proposeModel(UriInfo uriInfo) {
    return diagram(uriInfo).path(DiagramApi.class, "proposeModel");
  }
}
