package reengineering.ddd.teamai.api;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.api.application.AcpGatewayRoutingController;

/** Runtime gateway rollout controls for ACP migration. */
@Component
@Produces(MediaType.APPLICATION_JSON)
public class AcpGatewayAdminApi {
  @Inject AcpGatewayRoutingController routingController;

  @GET
  @Path("mode")
  public Map<String, Object> mode() {
    return statusPayload();
  }

  @POST
  @Path("mode")
  @Consumes(MediaType.APPLICATION_JSON)
  public Map<String, Object> updateMode(UpdateModeRequest request) {
    if (request == null || request.mode == null || request.mode.isBlank()) {
      throw new IllegalArgumentException("mode must be local or remote");
    }
    routingController.updateMode(request.mode.trim());
    return statusPayload();
  }

  private Map<String, Object> statusPayload() {
    Map<String, Object> rollback = new LinkedHashMap<>();
    rollback.put("errorThreshold", routingController.rollbackErrorThreshold());
    rollback.put("windowMs", routingController.rollbackWindowMs());
    rollback.put("cooldownMs", routingController.rollbackCooldownMs());
    rollback.put("recentFailureCount", routingController.remoteFailureCountInWindow());
    rollback.put("forcedLocalUntil", routingController.forcedLocalUntilIso());

    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("requestedMode", routingController.requestedMode());
    payload.put("effectiveMode", routingController.effectiveMode());
    payload.put("rollback", rollback);
    return payload;
  }

  public static class UpdateModeRequest {
    public String mode;
  }
}
