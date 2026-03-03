package reengineering.ddd.teamai.api.application;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.Timer;
import jakarta.inject.Inject;
import java.time.Duration;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

@Component
public class OrchestrationTelemetry {
  private static final Logger log = LoggerFactory.getLogger(OrchestrationTelemetry.class);
  private final MeterRegistry meterRegistry;

  @Inject
  public OrchestrationTelemetry(ObjectProvider<MeterRegistry> meterRegistryProvider) {
    this(meterRegistryProvider.getIfAvailable());
  }

  OrchestrationTelemetry(MeterRegistry meterRegistry) {
    this.meterRegistry = meterRegistry;
  }

  public static OrchestrationTelemetry noop() {
    return new OrchestrationTelemetry((MeterRegistry) null);
  }

  public String ensureTraceId() {
    String traceId = MDC.get("traceId");
    if (traceId == null || traceId.isBlank()) {
      traceId = UUID.randomUUID().toString();
      MDC.put("traceId", traceId);
    }
    return traceId;
  }

  public void sessionTransition(
      String sessionId,
      String taskId,
      String agentId,
      String fromState,
      String toState,
      String reason) {
    String traceId = ensureTraceId();
    log.info(
        "event=orchestration_session_transition traceId={} sessionId={} taskId={} agentId={} from={} to={} reason={}",
        traceId,
        value(sessionId),
        value(taskId),
        value(agentId),
        value(fromState),
        value(toState),
        value(reason));
    incrementCounter(
        "teamai.orchestration.session.transition",
        Tags.of("from", value(fromState), "to", value(toState)));
  }

  public void stepTransition(
      String sessionId, String stepId, String taskId, String agentId, String toState) {
    String traceId = ensureTraceId();
    log.info(
        "event=orchestration_step_transition traceId={} sessionId={} stepId={} taskId={} agentId={} to={}",
        traceId,
        value(sessionId),
        value(stepId),
        value(taskId),
        value(agentId),
        value(toState));
    incrementCounter("teamai.orchestration.step.transition", Tags.of("to", value(toState)));
  }

  public void runtimeResult(
      String sessionId, String taskId, String agentId, String outcome, Duration latency) {
    String traceId = ensureTraceId();
    log.info(
        "event=orchestration_runtime_result traceId={} sessionId={} taskId={} agentId={} outcome={} latencyMs={}",
        traceId,
        value(sessionId),
        value(taskId),
        value(agentId),
        value(outcome),
        Math.max(0L, latency.toMillis()));
    incrementCounter("teamai.orchestration.runtime.result", Tags.of("outcome", value(outcome)));
    if (meterRegistry != null) {
      Timer.builder("teamai.orchestration.runtime.latency")
          .tags("outcome", value(outcome))
          .register(meterRegistry)
          .record(latency);
    }
  }

  public void runtimeError(
      String sessionId, String taskId, String agentId, String message, Throwable error) {
    String traceId = ensureTraceId();
    log.error(
        "event=orchestration_runtime_error traceId={} sessionId={} taskId={} agentId={} message={}",
        traceId,
        value(sessionId),
        value(taskId),
        value(agentId),
        value(message),
        error);
    incrementCounter("teamai.orchestration.runtime.error", Tags.empty());
  }

  public void runtimeRetry(
      String sessionId, String taskId, String agentId, int nextAttempt, String reason) {
    String traceId = ensureTraceId();
    log.warn(
        "event=orchestration_runtime_retry traceId={} sessionId={} taskId={} agentId={} nextAttempt={} reason={}",
        traceId,
        value(sessionId),
        value(taskId),
        value(agentId),
        nextAttempt,
        value(reason));
    incrementCounter("teamai.orchestration.runtime.retry", Tags.empty());
  }

  private void incrementCounter(String name, Tags tags) {
    if (meterRegistry != null) {
      meterRegistry.counter(name, tags).increment();
    }
  }

  private String value(String value) {
    if (value == null || value.isBlank()) {
      return "n/a";
    }
    return value;
  }
}
