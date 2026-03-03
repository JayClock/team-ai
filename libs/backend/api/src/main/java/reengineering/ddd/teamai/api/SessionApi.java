package reengineering.ddd.teamai.api;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.util.LinkedHashMap;
import java.util.Map;
import reengineering.ddd.teamai.api.acp.AcpEventEnvelope;
import reengineering.ddd.teamai.api.application.AcpRuntimeBridgeService;
import reengineering.ddd.teamai.api.representation.AcpSessionModel;
import reengineering.ddd.teamai.model.AcpSession;
import reengineering.ddd.teamai.model.Project;

public class SessionApi {
  @Inject private AcpRuntimeBridgeService runtimeBridgeService;

  private final Project project;
  private final AcpSession session;

  public SessionApi(Project project, AcpSession session) {
    this.project = project;
    this.session = session;
  }

  @GET
  @VendorMediaType(ResourceTypes.SESSION)
  public AcpSessionModel get(@Context UriInfo uriInfo) {
    return AcpSessionModel.of(project, session, uriInfo);
  }

  @GET
  @Path("history")
  public Response history(
      @DefaultValue("200") @QueryParam("limit") int limit,
      @QueryParam("since") String sinceEventId) {
    var history =
        runtimeBridgeService.findHistory(
            project.getIdentity(), session.getIdentity(), sinceEventId, limit);
    return Response.ok(historyPayload(history)).build();
  }

  private Map<String, Object> historyPayload(java.util.List<AcpEventEnvelope> history) {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("projectId", project.getIdentity());
    payload.put("sessionId", session.getIdentity());
    payload.put("history", history);
    return payload;
  }

  @PATCH
  @Consumes(MediaType.APPLICATION_JSON)
  public Response rename(@Valid UpdateSessionRequest request) {
    try {
      project.renameAcpSession(session.getIdentity(), request.name);
      return Response.ok(Map.of("ok", true, "name", request.name.trim())).build();
    } catch (IllegalArgumentException error) {
      throw new WebApplicationException(error.getMessage(), Response.Status.BAD_REQUEST);
    } catch (IllegalStateException error) {
      throw new WebApplicationException(error.getMessage(), Response.Status.CONFLICT);
    }
  }

  @DELETE
  public Response delete() {
    try {
      project.deleteAcpSession(session.getIdentity());
      return Response.noContent().build();
    } catch (IllegalStateException error) {
      throw new WebApplicationException(error.getMessage(), Response.Status.CONFLICT);
    }
  }

  public static class UpdateSessionRequest {
    @NotNull public String name;
  }
}
