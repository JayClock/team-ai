package reengineering.ddd.teamai.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.hateoas.CollectionModel;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.http.HttpMethod;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.representation.TaskModel;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Task;

public class TasksApi {
  @Context ResourceContext resourceContext;

  private final Project project;

  public TasksApi(Project project) {
    this.project = project;
  }

  @Path("{task-id}")
  public TaskApi findById(@PathParam("task-id") String id) {
    return project
        .tasks()
        .findByIdentity(id)
        .map(
            task -> {
              TaskApi api = new TaskApi(project, task);
              return resourceContext.initResource(api);
            })
        .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }

  @GET
  @VendorMediaType(ResourceTypes.TASK_COLLECTION)
  public CollectionModel<TaskModel> findAll(
      @Context UriInfo uriInfo, @DefaultValue("0") @QueryParam("page") int page) {
    CollectionModel<TaskModel> model =
        new Pagination<>(project.tasks().findAll(), 40)
            .page(
                page,
                task -> TaskModel.simple(project, task, uriInfo),
                p ->
                    ApiTemplates.tasks(uriInfo).queryParam("page", p).build(project.getIdentity()));

    model.add(
        Affordances.of(
                Link.of(ApiTemplates.tasks(uriInfo).build(project.getIdentity()).getPath())
                    .withRel("create-task"))
            .afford(HttpMethod.POST)
            .withInput(CreateTaskRequest.class)
            .andAfford(HttpMethod.POST)
            .withInput(CreateTaskRequest.class)
            .withName("create-task")
            .toLink());

    return model;
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(@Valid CreateTaskRequest request, @Context UriInfo uriInfo) {
    TaskDescription description =
        new TaskDescription(
            request.getTitle(),
            request.getObjective(),
            request.getScope(),
            request.getAcceptanceCriteria(),
            request.getVerificationCommands(),
            request.getStatus() == null ? TaskDescription.Status.PENDING : request.getStatus(),
            toRef(request.getAssignedTo()),
            toRef(request.getDelegatedBy()),
            request.getCompletionSummary(),
            request.getVerificationVerdict(),
            request.getVerificationReport());

    Task created = project.createTask(description);
    return Response.created(
            ApiTemplates.task(uriInfo).build(project.getIdentity(), created.getIdentity()))
        .entity(TaskModel.of(project, created, uriInfo))
        .build();
  }

  private Ref<String> toRef(String id) {
    if (id == null || id.isBlank()) {
      return null;
    }
    return new Ref<>(id);
  }

  @Data
  @NoArgsConstructor
  public static class CreateTaskRequest {
    @NotBlank private String title;
    @NotBlank private String objective;

    private String scope;
    private List<String> acceptanceCriteria;
    private List<String> verificationCommands;
    private TaskDescription.Status status;
    private String assignedTo;
    private String delegatedBy;
    private String completionSummary;
    private TaskDescription.VerificationVerdict verificationVerdict;
    private String verificationReport;
  }
}
