package reengineering.ddd.teamai.api.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.inject.Inject;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.model.AgentProtocolGateway;

/**
 * Delegates to local or remote gateway with runtime switch + rollout guards.
 *
 * <p>Route decisions are sticky per session to avoid crossing runtimes mid-session.
 */
@Component
@Primary
public class SwitchableAgentProtocolGateway implements AgentProtocolGateway {
  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

  private final AgentProtocolGateway localGateway;
  private final AgentProtocolGateway remoteGateway;
  private final AcpGatewayRoutingController routingController;
  private final Set<String> rolloutProjectAllowlist;
  private final Set<String> rolloutUserAllowlist;
  private final int rolloutPercent;
  private final Map<String, Route> sessionRoutes = new ConcurrentHashMap<>();

  @Inject
  public SwitchableAgentProtocolGateway(
      AgentRuntimeGateway localGateway,
      AcpGatewayRoutingController routingController,
      @Value("${team-ai.acp.gateway.base-url:http://127.0.0.1:3321}") String baseUrl,
      @Value("${team-ai.acp.gateway.poll-interval-ms:200}") long pollIntervalMillis,
      @Value("${team-ai.acp.gateway.rollout.projects:}") String rolloutProjects,
      @Value("${team-ai.acp.gateway.rollout.users:}") String rolloutUsers,
      @Value("${team-ai.acp.gateway.rollout.percent:100}") int rolloutPercent) {
    this(
        localGateway,
        new HttpAgentProtocolGateway(baseUrl, pollIntervalMillis),
        routingController,
        parseList(rolloutProjects),
        parseList(rolloutUsers),
        rolloutPercent);
  }

  SwitchableAgentProtocolGateway(
      AgentProtocolGateway localGateway,
      AgentProtocolGateway remoteGateway,
      AcpGatewayRoutingController routingController) {
    this(localGateway, remoteGateway, routingController, Set.of(), Set.of(), 100);
  }

  SwitchableAgentProtocolGateway(
      AgentProtocolGateway localGateway,
      AgentProtocolGateway remoteGateway,
      AcpGatewayRoutingController routingController,
      Set<String> rolloutProjectAllowlist,
      Set<String> rolloutUserAllowlist,
      int rolloutPercent) {
    this.localGateway = localGateway;
    this.remoteGateway = remoteGateway;
    this.routingController = routingController;
    this.rolloutProjectAllowlist = Set.copyOf(rolloutProjectAllowlist);
    this.rolloutUserAllowlist = Set.copyOf(rolloutUserAllowlist);
    this.rolloutPercent = Math.max(0, Math.min(100, rolloutPercent));
  }

  @Override
  public SessionHandle start(StartRequest request) {
    String sessionKey = sessionKey(request.orchestrationId(), request.orchestrationId());
    Route route = pickRouteForStart(request);
    if (route == Route.REMOTE) {
      try {
        SessionHandle handle = remoteGateway.start(request);
        routingController.recordRemoteSuccess();
        sessionRoutes.put(sessionKey, Route.REMOTE);
        return handle;
      } catch (RuntimeException error) {
        routingController.recordRemoteFailure(error);
        if (routingController.shouldUseRemote()) {
          throw error;
        }
      }
    }

    SessionHandle handle = localGateway.start(request);
    sessionRoutes.put(sessionKey, Route.LOCAL);
    return handle;
  }

  @Override
  public SendResult send(SessionHandle session, SendRequest request) {
    Route route = routeForSession(session);
    if (route == Route.REMOTE) {
      try {
        SendResult result = remoteGateway.send(session, request);
        routingController.recordRemoteSuccess();
        return result;
      } catch (RuntimeException error) {
        routingController.recordRemoteFailure(error);
        throw error;
      }
    }
    return localGateway.send(session, request);
  }

  @Override
  public void stop(SessionHandle session) {
    Route route = routeForSession(session);
    try {
      if (route == Route.REMOTE) {
        remoteGateway.stop(session);
      } else {
        localGateway.stop(session);
      }
    } finally {
      sessionRoutes.remove(sessionKey(session.orchestrationId(), session.sessionId()));
    }
  }

  @Override
  public Health health() {
    if (!routingController.shouldUseRemote()) {
      return localGateway.health();
    }
    try {
      Health remote = remoteGateway.health();
      routingController.recordRemoteSuccess();
      return remote;
    } catch (RuntimeException error) {
      routingController.recordRemoteFailure(error);
      if (!routingController.shouldUseRemote()) {
        return localGateway.health();
      }
      throw error;
    }
  }

  public AcpGatewayRoutingController routingController() {
    return routingController;
  }

  private Route pickRouteForStart(StartRequest request) {
    if (!routingController.shouldUseRemote()) {
      return Route.LOCAL;
    }
    if (!matchesRolloutPolicy(request)) {
      return Route.LOCAL;
    }
    return Route.REMOTE;
  }

  private boolean matchesRolloutPolicy(StartRequest request) {
    if (rolloutPercent <= 0) {
      return false;
    }
    if (rolloutPercent < 100) {
      int bucket = Math.floorMod(request.orchestrationId().hashCode(), 100);
      if (bucket >= rolloutPercent) {
        return false;
      }
    }

    if (!rolloutUserAllowlist.isEmpty() && !rolloutUserAllowlist.contains(request.agentId())) {
      return false;
    }

    if (rolloutProjectAllowlist.isEmpty()) {
      return true;
    }
    String projectId = projectIdFromRequest(request);
    return projectId != null && rolloutProjectAllowlist.contains(projectId);
  }

  private Route routeForSession(SessionHandle session) {
    String key = sessionKey(session.orchestrationId(), session.sessionId());
    Route explicit = sessionRoutes.get(key);
    if (explicit != null) {
      return explicit;
    }
    return routingController.shouldUseRemote() ? Route.REMOTE : Route.LOCAL;
  }

  private String sessionKey(String orchestrationId, String sessionId) {
    if (orchestrationId != null && !orchestrationId.isBlank()) {
      return orchestrationId.trim();
    }
    return sessionId == null ? "unknown" : sessionId.trim();
  }

  private String projectIdFromRequest(StartRequest request) {
    String raw = request.mcpConfig();
    if (raw == null || raw.isBlank()) {
      return null;
    }
    try {
      JsonNode root = OBJECT_MAPPER.readTree(raw);
      if (!root.isObject()) {
        return null;
      }
      JsonNode value = root.path("projectId");
      if (value.isMissingNode() || value.isNull()) {
        return null;
      }
      String projectId = value.asText();
      return projectId == null || projectId.isBlank() ? null : projectId.trim();
    } catch (Exception ignored) {
      return null;
    }
  }

  private static Set<String> parseList(String csv) {
    if (csv == null || csv.isBlank()) {
      return Set.of();
    }
    Set<String> values = new LinkedHashSet<>();
    Arrays.stream(csv.split(","))
        .map(String::trim)
        .filter(value -> !value.isBlank())
        .forEach(values::add);
    return values;
  }

  private enum Route {
    LOCAL,
    REMOTE
  }
}
