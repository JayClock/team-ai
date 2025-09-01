package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;
import reengineering.ddd.teamai.description.ContextDescription;
import reengineering.ddd.teamai.model.Context;

@Relation(collectionRelation = "contexts")
public class ContextModel extends RepresentationModel<ContextModel> {
  @JsonProperty
  private String id;
  @JsonUnwrapped
  private ContextDescription description;

  public ContextModel(Context context) {
    this.id = context.getIdentity();
    this.description = context.getDescription();
  }
}
