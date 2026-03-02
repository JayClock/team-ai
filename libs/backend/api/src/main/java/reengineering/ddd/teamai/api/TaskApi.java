package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.representation.TaskModel;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Task;

public class TaskApi {
  private final Project project;
  private final Task task;

  public TaskApi(Project project, Task task) {
    this.project = project;
    this.task = task;
  }

  @GET
  @VendorMediaType(ResourceTypes.TASK)
  public TaskModel get(@Context UriInfo uriInfo) {
    return TaskModel.of(project, task, uriInfo);
  }
}
