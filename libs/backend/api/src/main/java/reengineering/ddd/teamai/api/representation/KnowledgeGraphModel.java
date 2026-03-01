package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.model.KnowledgeGraph;
import reengineering.ddd.teamai.model.Project;

public class KnowledgeGraphModel extends RepresentationModel<KnowledgeGraphModel> {
  @JsonProperty private final String projectId;
  @JsonProperty private final List<KnowledgeGraph.Node> nodes;
  @JsonProperty private final List<KnowledgeGraph.Edge> edges;

  public KnowledgeGraphModel(
      String projectId, List<KnowledgeGraph.Node> nodes, List<KnowledgeGraph.Edge> edges) {
    this.projectId = projectId;
    this.nodes = nodes;
    this.edges = edges;
  }

  public static KnowledgeGraphModel of(Project project, KnowledgeGraph graph, UriInfo uriInfo) {
    KnowledgeGraphModel model =
        new KnowledgeGraphModel(project.getIdentity(), graph.nodes(), graph.edges());
    model.add(
        Link.of(ApiTemplates.knowledgeGraph(uriInfo).build(project.getIdentity()).getPath())
            .withSelfRel());
    model.add(
        Link.of(ApiTemplates.project(uriInfo).build(project.getIdentity()).getPath())
            .withRel("project"));
    return model;
  }
}
