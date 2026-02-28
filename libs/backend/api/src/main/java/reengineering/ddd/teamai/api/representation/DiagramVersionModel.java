package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.description.DiagramVersionDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramVersion;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "versions")
public class DiagramVersionModel extends RepresentationModel<DiagramVersionModel> {
  @JsonProperty private String id;
  @JsonProperty private String name;
  @JsonProperty private DiagramVersionDescription.DiagramSnapshot snapshot;

  public DiagramVersionModel(
      Project project, Diagram diagram, DiagramVersion version, UriInfo uriInfo) {
    this.id = version.getIdentity();
    this.name = version.getDescription().name();
    this.snapshot = version.getDescription().snapshot();
  }

  public static DiagramVersionModel of(
      Project project, Diagram diagram, DiagramVersion version, UriInfo uriInfo) {
    DiagramVersionModel model = new DiagramVersionModel(project, diagram, version, uriInfo);
    model.add(
        Link.of(
                ApiTemplates.version(uriInfo)
                    .build(project.getIdentity(), diagram.getIdentity(), version.getIdentity())
                    .getPath())
            .withSelfRel());
    model.add(
        Link.of(
                ApiTemplates.diagram(uriInfo)
                    .build(project.getIdentity(), diagram.getIdentity())
                    .getPath())
            .withRel("diagram"));
    model.add(
        Link.of(
                ApiTemplates.versions(uriInfo)
                    .build(project.getIdentity(), diagram.getIdentity())
                    .getPath())
            .withRel("collection"));
    return model;
  }

  public static DiagramVersionModel simple(
      Project project, Diagram diagram, DiagramVersion version, UriInfo uriInfo) {
    DiagramVersionModel model = new DiagramVersionModel(project, diagram, version, uriInfo);
    model.add(
        Link.of(
                ApiTemplates.version(uriInfo)
                    .build(project.getIdentity(), diagram.getIdentity(), version.getIdentity())
                    .getPath())
            .withSelfRel());
    return model;
  }
}
