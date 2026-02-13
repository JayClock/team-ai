package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.ws.rs.core.UriInfo;
import java.util.Map;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;
import reengineering.ddd.archtype.JsonBlob;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.api.EdgesApi;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "edges")
public class DiagramEdgeModel extends RepresentationModel<DiagramEdgeModel> {
  @JsonProperty private String id;
  @JsonProperty private String sourceNodeId;
  @JsonProperty private String targetNodeId;
  @JsonProperty private String sourceHandle;
  @JsonProperty private String targetHandle;
  @JsonProperty private String relationType;
  @JsonProperty private String label;
  @JsonProperty private Map<String, Object> styleProps;

  private static final ObjectMapper objectMapper = new ObjectMapper();

  public DiagramEdgeModel(Project project, Diagram diagram, DiagramEdge entity, UriInfo uriInfo) {
    EdgeDescription desc = entity.getDescription();
    this.id = entity.getIdentity();
    this.sourceNodeId = desc.sourceNode() != null ? desc.sourceNode().id() : null;
    this.targetNodeId = desc.targetNode() != null ? desc.targetNode().id() : null;
    this.sourceHandle = desc.sourceHandle();
    this.targetHandle = desc.targetHandle();
    this.relationType = desc.relationType();
    this.label = desc.label();
    this.styleProps = parseJsonBlob(desc.styleProps());

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

  private Map<String, Object> parseJsonBlob(JsonBlob blob) {
    if (blob == null || blob.json() == null || blob.json().isEmpty()) {
      return Map.of();
    }
    try {
      return objectMapper.readValue(blob.json(), new TypeReference<Map<String, Object>>() {});
    } catch (Exception e) {
      return Map.of();
    }
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
