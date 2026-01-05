package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.SecurityContext;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.api.representation.RootModel;

import java.security.Principal;

@Component
@Path("/")
public class RootApi {

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  public RootModel get(@Context SecurityContext securityContext, @Context UriInfo uriInfo) {
    Principal principal = securityContext.getUserPrincipal();

    if (principal == null) {
      return RootModel.anonymous(uriInfo);
    } else {
      String userId = principal.getName();
      return RootModel.authenticated(userId, uriInfo);
    }
  }
}
