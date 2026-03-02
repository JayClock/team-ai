package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Task;

@Relation(collectionRelation = "tasks")
public class TaskModel extends RepresentationModel<TaskModel> {
  @JsonProperty private String id;
  @JsonUnwrapped private TaskDescription description;
  @JsonProperty private Ref<String> project;

  public TaskModel(Project project, Task task, UriInfo uriInfo) {
    this.id = task.getIdentity();
    this.description = task.getDescription();
    this.project = new Ref<>(project.getIdentity());
  }

  public static TaskModel of(Project project, Task task, UriInfo uriInfo) {
    TaskModel model = new TaskModel(project, task, uriInfo);
    model.add(
        Link.of(
                ApiTemplates.task(uriInfo)
                    .build(project.getIdentity(), task.getIdentity())
                    .getPath())
            .withSelfRel());
    model.add(
        Link.of(ApiTemplates.tasks(uriInfo).build(project.getIdentity()).getPath())
            .withRel("collection"));
    return model;
  }

  public static TaskModel simple(Project project, Task task, UriInfo uriInfo) {
    TaskModel model = new TaskModel(project, task, uriInfo);
    model.add(
        Link.of(
                ApiTemplates.task(uriInfo)
                    .build(project.getIdentity(), task.getIdentity())
                    .getPath())
            .withSelfRel());
    return model;
  }
}
