package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.Map;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.api.EdgesApi;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "edges")
public class DiagramEdgeModel extends RepresentationModel<DiagramEdgeModel> {
  @JsonProperty private String id;
  @JsonProperty private Ref<String> sourceNode;
  @JsonProperty private Ref<String> targetNode;
  @JsonProperty private String sourceHandle;
  @JsonProperty private String targetHandle;
  @JsonProperty private String relationType;
  @JsonProperty private String label;
  @JsonProperty private Map<String, Object> styleProps;
  @JsonProperty private boolean hidden;

  public DiagramEdgeModel(Project project, Diagram diagram, DiagramEdge entity, UriInfo uriInfo) {
    EdgeDescription desc = entity.getDescription();
    this.id = entity.getIdentity();
    this.sourceNode = desc.sourceNode();
    this.targetNode = desc.targetNode();
    this.sourceHandle = desc.sourceHandle();
    this.targetHandle = desc.targetHandle();
    this.relationType = desc.relationType();
    this.label = desc.label();
    this.styleProps = JsonBlobReader.read(desc.styleProps());
    this.hidden = desc.hidden();

    add(
        Affordances.of(
                Link.of(
                        ApiTemplates.edge(uriInfo)
                            .build(
                                project.getIdentity(), diagram.getIdentity(), entity.getIdentity())
                            .getPath())
                    .withSelfRel())
            .afford(HttpMethod.PUT)
            .withInput(EdgeDescription.class)
            .andAfford(HttpMethod.DELETE)
            .withName("delete-edge")
            .toLink());

    add(
        Affordances.of(
                Link.of(
                        ApiTemplates.edges(uriInfo)
                            .build(project.getIdentity(), diagram.getIdentity())
                            .getPath())
                    .withRel("edges"))
            .afford(HttpMethod.POST)
            .withInput(EdgesApi.CreateEdgeRequest.class)
            .withName("create-edge")
            .toLink());

    add(
        Link.of(
                ApiTemplates.diagram(uriInfo)
                    .build(project.getIdentity(), diagram.getIdentity())
                    .getPath())
            .withRel("diagram"));
  }

  public static DiagramEdgeModel simple(
      Project project, Diagram diagram, DiagramEdge diagramEdge, UriInfo uriInfo) {
    DiagramEdgeModel model = new DiagramEdgeModel(project, diagram, diagramEdge, uriInfo);
    model.add(
        Link.of(
                ApiTemplates.edge(uriInfo)
                    .build(project.getIdentity(), diagram.getIdentity(), diagramEdge.getIdentity())
                    .getPath())
            .withSelfRel());
    return model;
  }
}
