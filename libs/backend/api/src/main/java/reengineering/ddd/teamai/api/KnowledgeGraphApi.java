package reengineering.ddd.teamai.api;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.representation.KnowledgeGraphModel;
import reengineering.ddd.teamai.model.KnowledgeGraph;
import reengineering.ddd.teamai.model.KnowledgeGraphReader;
import reengineering.ddd.teamai.model.Project;

public class KnowledgeGraphApi {
  @Inject private KnowledgeGraphReader knowledgeGraphReader;

  private final Project project;

  public KnowledgeGraphApi(Project project) {
    this.project = project;
  }

  @GET
  @VendorMediaType(ResourceTypes.KNOWLEDGE_GRAPH)
  public KnowledgeGraphModel get(@Context UriInfo uriInfo) {
    KnowledgeGraph graph = knowledgeGraphReader.readProjectKnowledgeGraph(project.getIdentity());
    return KnowledgeGraphModel.of(project, graph, uriInfo);
  }
}
