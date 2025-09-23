package reengineering.ddd.teamai.api;

import jakarta.ws.rs.core.UriBuilder;
import jakarta.ws.rs.core.UriInfo;

public class ApiTemplates {
  public static UriBuilder user(UriInfo uriInfo) {
    return uriInfo.getBaseUriBuilder().path(UsersApi.class).path(UsersApi.class, "findById");
  }

  public static UriBuilder conversations(UriInfo uriInfo) {
    return user(uriInfo).path(UserApi.class, "conversations");
  }

  public static UriBuilder conversation(UriInfo uriInfo) {
    return conversations(uriInfo).path(ConversationsApi.class, "findById");
  }

  public static UriBuilder messages(UriInfo uriInfo) {
    return conversation(uriInfo).path(ConversationApi.class, "findAll");
  }
}
