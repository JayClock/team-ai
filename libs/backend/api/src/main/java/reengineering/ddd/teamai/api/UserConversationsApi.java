package reengineering.ddd.teamai.api;

import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.CollectionModel;
import reengineering.ddd.teamai.api.representation.ConversationModel;
import reengineering.ddd.teamai.model.User;

public class UserConversationsApi {
  private final User user;

  public UserConversationsApi(User user) {
    this.user = user;
  }

  @GET
  public CollectionModel<ConversationModel> findAll(@Context UriInfo uriInfo, @DefaultValue("0") @QueryParam("page") int page) {
    return new Pagination<>(user.conversations().findAll(), 40).page(page,
      ConversationModel::new,
      p -> ApiTemplates.conversations(uriInfo).queryParam("page", p).build(user.getIdentity()));
  }
}
