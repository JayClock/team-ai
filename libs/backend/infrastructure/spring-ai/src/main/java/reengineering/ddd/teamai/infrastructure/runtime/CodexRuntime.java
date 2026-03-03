package reengineering.ddd.teamai.infrastructure.runtime;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import reengineering.ddd.teamai.model.AgentRuntime;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.AgentRuntimeTimeoutException;

public class CodexRuntime implements AgentRuntime {
  private static final List<String> DEFAULT_COMMAND = List.of("codex", "exec", "-");
  private static final String MCP_CONFIG_ENV = "TEAMAI_MCP_SERVERS";

  private final List<String> command;
  private final Map<String, SessionState> sessions = new ConcurrentHashMap<>();

  public CodexRuntime() {
    this(DEFAULT_COMMAND);
  }

  CodexRuntime(List<String> command) {
    if (command == null || command.isEmpty()) {
      throw new IllegalArgumentException("command must not be empty");
    }
    this.command = List.copyOf(command);
  }

  @Override
  public SessionHandle start(StartRequest request) {
    if (request == null) {
      throw new IllegalArgumentException("request must not be null");
    }
    SessionHandle handle =
        new SessionHandle(
            "codex-runtime-" + UUID.randomUUID(),
            request.orchestrationId(),
            request.agentId(),
            Instant.now());
    sessions.put(handle.sessionId(), new SessionState(request.mcpConfig()));
    return handle;
  }

  @Override
  public SendResult send(SessionHandle session, SendRequest request) {
    if (request == null) {
      throw new IllegalArgumentException("request must not be null");
    }
    SessionState state = requireSession(session);
    Process process = startProcess(state.mcpConfig);
    state.process = process;

    ExecutorService ioPool = Executors.newFixedThreadPool(2);
    try {
      Future<String> stdoutFuture = ioPool.submit(() -> readAll(process.getInputStream()));
      Future<String> stderrFuture = ioPool.submit(() -> readAll(process.getErrorStream()));

      process.getOutputStream().write(request.input().getBytes(StandardCharsets.UTF_8));
      process.getOutputStream().flush();
      process.getOutputStream().close();

      if (!process.waitFor(request.timeout().toMillis(), TimeUnit.MILLISECONDS)) {
        process.destroyForcibly();
        throw new AgentRuntimeTimeoutException(
            "Codex runtime timed out after " + request.timeout().toMillis() + "ms");
      }

      String stdout = stdoutFuture.get(1, TimeUnit.SECONDS);
      String stderr = stderrFuture.get(1, TimeUnit.SECONDS);
      int exitCode = process.exitValue();
      if (exitCode != 0) {
        throw new AgentRuntimeException(
            "Codex process exited with code " + exitCode + ": " + stderr.strip());
      }
      return new SendResult(stdout.strip(), Instant.now());
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new AgentRuntimeException("Codex runtime was interrupted");
    } catch (TimeoutException error) {
      process.destroyForcibly();
      throw new AgentRuntimeException("Timed out while collecting Codex process output");
    } catch (ExecutionException error) {
      throw new AgentRuntimeException(
          "Failed to collect Codex process output: " + error.getCause());
    } catch (IOException error) {
      throw new AgentRuntimeException(
          "Failed to communicate with Codex process: " + error.getMessage());
    } finally {
      ioPool.shutdownNow();
      state.process = null;
    }
  }

  @Override
  public void stop(SessionHandle session) {
    SessionState state = requireSession(session);
    Process process = state.process;
    if (process != null && process.isAlive()) {
      process.destroyForcibly();
    }
    sessions.remove(session.sessionId());
  }

  @Override
  public Health health() {
    return new Health(Status.UP, sessions.size(), "Codex runtime ready");
  }

  private SessionState requireSession(SessionHandle session) {
    if (session == null) {
      throw new IllegalArgumentException("session must not be null");
    }
    SessionState state = sessions.get(session.sessionId());
    if (state == null) {
      throw new AgentRuntimeException("Runtime session is not active: " + session.sessionId());
    }
    return state;
  }

  private Process startProcess(String mcpConfig) {
    ProcessBuilder processBuilder = new ProcessBuilder(command);
    processBuilder.redirectErrorStream(false);
    if (mcpConfig != null && !mcpConfig.isBlank()) {
      processBuilder.environment().put(MCP_CONFIG_ENV, mcpConfig);
    }
    try {
      return processBuilder.start();
    } catch (IOException error) {
      throw new AgentRuntimeException("Failed to start Codex process: " + error.getMessage());
    }
  }

  private static String readAll(java.io.InputStream stream) {
    try (stream) {
      return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
    } catch (IOException error) {
      throw new UncheckedIOException(error);
    }
  }

  private static class SessionState {
    private final String mcpConfig;
    private volatile Process process;

    private SessionState(String mcpConfig) {
      this.mcpConfig = mcpConfig;
    }
  }
}
