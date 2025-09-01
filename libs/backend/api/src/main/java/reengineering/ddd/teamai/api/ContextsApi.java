package reengineering.ddd.teamai.api;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import org.springframework.hateoas.CollectionModel;
import reengineering.ddd.teamai.api.representation.ContextModel;
import reengineering.ddd.teamai.model.Contexts;

import java.util.List;

@Path("contexts")
public class ContextsApi {
  @Inject
  private Contexts contexts;

  @GET
  public CollectionModel<ContextModel> findAll() {
    List<ContextModel> list = contexts.findAll().stream().map(ContextModel::new).toList();
    return CollectionModel.of(list);
  }
}
