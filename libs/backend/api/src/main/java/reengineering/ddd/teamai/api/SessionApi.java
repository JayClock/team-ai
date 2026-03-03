package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.representation.AcpSessionModel;
import reengineering.ddd.teamai.model.AcpSession;
import reengineering.ddd.teamai.model.Project;

public class SessionApi {
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
}
