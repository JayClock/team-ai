package reengineering.ddd.teamai.api;

import jakarta.ws.rs.core.UriBuilder;
import jakarta.ws.rs.core.UriInfo;

public class ApiTemplates {
  public static UriBuilder user(UriInfo uriInfo) {
    return uriInfo.getBaseUriBuilder().path(UsersApi.class).path(UsersApi.class, "findById");
  }

  public static UriBuilder accounts(UriInfo uriInfo) {
    return user(uriInfo).path(UserApi.class, "accounts");
  }

  public static UriBuilder account(UriInfo uriInfo) {
    return accounts(uriInfo).path(AccountsApi.class, "findById");
  }

  public static UriBuilder projects(UriInfo uriInfo) {
    return user(uriInfo).path(UserApi.class, "projects");
  }

  public static UriBuilder project(UriInfo uriInfo) {
    return projects(uriInfo).path(ProjectsApi.class, "findById");
  }

  public static UriBuilder projectConversations(UriInfo uriInfo) {
    return project(uriInfo).path(ProjectApi.class, "conversations");
  }

  public static UriBuilder conversations(UriInfo uriInfo) {
    return user(uriInfo).path(UserApi.class, "conversations");
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
}
