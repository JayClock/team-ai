package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.hateoas.CollectionModel;
import org.springframework.hateoas.Link;
import reengineering.ddd.teamai.api.representation.ProjectModel;
import reengineering.ddd.teamai.model.User;

public class UserProjectsApi {
  private final User user;

  public UserProjectsApi(User user) {
    this.user = user;
  }

  @GET
  @VendorMediaType(ResourceTypes.PROJECT_COLLECTION)
  public CollectionModel<ProjectModel> findAll(@Context UriInfo uriInfo) {
    List<ProjectModel> projects =
        user.projects().findAll().stream()
            .map(project -> ProjectModel.simple(project, uriInfo))
            .collect(Collectors.toList());
    return CollectionModel.of(
        projects,
        Link.of(ApiTemplates.userProjects(uriInfo).build(user.getIdentity()).getPath())
            .withSelfRel());
  }
}
