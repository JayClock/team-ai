package reengineering.ddd.teamai.api.application;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.inject.Inject;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.description.TaskReportDescription;
import reengineering.ddd.teamai.model.AgentRuntime;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.OrchestrationSession;
import reengineering.ddd.teamai.model.Project;

@Component
public class OrchestrationRuntimeService {
  private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(30);
  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

  private final AgentRuntime runtime;
  private final Map<String, AgentRuntime.SessionHandle> activeHandles = new ConcurrentHashMap<>();

  @Inject
  public OrchestrationRuntimeService(AgentRuntime runtime) {
    this.runtime = runtime;
  }

  public void onSessionStarted(Project project, OrchestrationSession session, Instant occurredAt) {
    if (project == null) {
      throw new IllegalArgumentException("project must not be null");
    }
    if (session == null) {
      throw new IllegalArgumentException("session must not be null");
    }
    Instant eventTime = occurredAt == null ? Instant.now() : occurredAt;

    var description = session.getDescription();
    String implementerId =
        Optional.ofNullable(description.implementer())
            .map(reengineering.ddd.archtype.Ref::id)
            .filter(id -> !id.isBlank())
            .orElseThrow(() -> new IllegalArgumentException("implementer must not be blank"));
    String mcpConfig = serializeMcpConfig(project);

    AgentRuntime.SessionHandle handle =
        runtime.start(
            new AgentRuntime.StartRequest(
                session.getIdentity(), implementerId, description.goal(), mcpConfig));
    activeHandles.put(session.getIdentity(), handle);

    Ref<String> implementer = description.implementer();
    Ref<String> taskRef = description.task();
    try {
      AgentRuntime.SendResult result =
          runtime.send(handle, new AgentRuntime.SendRequest(description.goal(), DEFAULT_TIMEOUT));
      String output = result.output();
      project.reportTask(
          taskRef.id(),
          implementer,
          new TaskReportDescription("Codex runtime output", true, output));
      project.updateTaskStatus(taskRef.id(), TaskDescription.Status.REVIEW_REQUIRED, output);
      project.appendEvent(
          new AgentEventDescription(
              AgentEventDescription.Type.REPORT_SUBMITTED,
              implementer,
              taskRef,
              output,
              eventTime));
      project.updateOrchestrationSessionStatus(
          session.getIdentity(),
          OrchestrationSessionDescription.Status.REVIEW_REQUIRED,
          description.currentStep(),
          eventTime,
          null);
    } catch (AgentRuntimeException error) {
      String message = error.getMessage() == null ? "Runtime failed" : error.getMessage();
      project.reportTask(
          taskRef.id(),
          implementer,
          new TaskReportDescription("Codex runtime execution failed", false, message));
      project.updateTaskStatus(taskRef.id(), TaskDescription.Status.BLOCKED, message);
      project.appendEvent(
          new AgentEventDescription(
              AgentEventDescription.Type.AGENT_ERROR, implementer, taskRef, message, eventTime));
      project.appendEvent(
          new AgentEventDescription(
              AgentEventDescription.Type.TASK_FAILED, implementer, taskRef, message, eventTime));
      project.updateOrchestrationSessionStatus(
          session.getIdentity(),
          OrchestrationSessionDescription.Status.FAILED,
          description.currentStep(),
          eventTime,
          message);
      throw error;
    }
  }

  public void onSessionCancelled(String sessionId) {
    if (sessionId == null || sessionId.isBlank()) {
      throw new IllegalArgumentException("sessionId must not be blank");
    }
    AgentRuntime.SessionHandle handle = activeHandles.remove(sessionId);
    if (handle != null) {
      runtime.stop(handle);
    }
  }

  public Optional<AgentRuntime.SessionHandle> findHandle(String sessionId) {
    return Optional.ofNullable(activeHandles.get(sessionId));
  }

  private String serializeMcpConfig(Project project) {
    List<Map<String, Object>> servers = new ArrayList<>();
    Project.McpServers mcpServers = project.mcpServers();
    if (mcpServers == null || mcpServers.findAll() == null) {
      return null;
    }
    mcpServers.findAll().stream()
        .filter(server -> server.getDescription().enabled())
        .forEach(
            server -> {
              Map<String, Object> spec = new LinkedHashMap<>();
              spec.put("id", server.getIdentity());
              spec.put("name", server.getDescription().name());
              spec.put("transport", server.getDescription().transport().name());
              spec.put("target", server.getDescription().target());
              servers.add(spec);
            });
    if (servers.isEmpty()) {
      return null;
    }
    try {
      return OBJECT_MAPPER.writeValueAsString(servers);
    } catch (JsonProcessingException error) {
      throw new IllegalStateException("Failed to serialize MCP registry config", error);
    }
  }
}
