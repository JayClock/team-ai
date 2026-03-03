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
public class AcpRuntimeTelemetry {
  private static final Logger log = LoggerFactory.getLogger(AcpRuntimeTelemetry.class);
  private final MeterRegistry meterRegistry;

  @Inject
  public AcpRuntimeTelemetry(ObjectProvider<MeterRegistry> meterRegistryProvider) {
    this(meterRegistryProvider.getIfAvailable());
  }

  AcpRuntimeTelemetry(MeterRegistry meterRegistry) {
    this.meterRegistry = meterRegistry;
  }

  public static AcpRuntimeTelemetry noop() {
    return new AcpRuntimeTelemetry((MeterRegistry) null);
  }

  public String ensureTraceId() {
    String traceId = MDC.get("traceId");
    if (traceId == null || traceId.isBlank()) {
      traceId = UUID.randomUUID().toString();
      MDC.put("traceId", traceId);
    }
    return traceId;
  }

  public void sessionCreateResult(
      String projectId,
      String sessionId,
      String actorUserId,
      String outcome,
      Duration latency,
      String errorCategory,
      String errorCode) {
    String traceId = ensureTraceId();
    Duration safeLatency = safe(latency);
    log.info(
        "event=acp_runtime_session_create traceId={} projectId={} sessionId={} actorUserId={} outcome={} latencyMs={} errorCategory={} errorCode={}",
        traceId,
        value(projectId),
        value(sessionId),
        value(actorUserId),
        value(outcome),
        safeLatency.toMillis(),
        value(errorCategory),
        value(errorCode));
    incrementCounter(
        "teamai.acp.session.create.total",
        Tags.of(
            "outcome", value(outcome),
            "errorCategory", value(errorCategory),
            "errorCode", value(errorCode)));
    recordTimer(
        "teamai.acp.session.create.latency", safeLatency, Tags.of("outcome", value(outcome)));
  }

  public void promptResult(
      String sessionId,
      String outcome,
      Duration latency,
      String errorCategory,
      String errorCode,
      boolean retryable) {
    String traceId = ensureTraceId();
    Duration safeLatency = safe(latency);
    log.info(
        "event=acp_runtime_prompt_result traceId={} sessionId={} outcome={} latencyMs={} errorCategory={} errorCode={} retryable={}",
        traceId,
        value(sessionId),
        value(outcome),
        safeLatency.toMillis(),
        value(errorCategory),
        value(errorCode),
        retryable);
    incrementCounter(
        "teamai.acp.prompt.total",
        Tags.of(
            "outcome", value(outcome),
            "errorCategory", value(errorCategory),
            "errorCode", value(errorCode),
            "retryable", Boolean.toString(retryable)));
    recordTimer("teamai.acp.prompt.latency", safeLatency, Tags.of("outcome", value(outcome)));
  }

  public void promptErrorDistribution(String category, String code, boolean retryable) {
    incrementCounter(
        "teamai.acp.prompt.error.distribution",
        Tags.of(
            "category", value(category),
            "code", value(code),
            "retryable", Boolean.toString(retryable)));
  }

  private void incrementCounter(String name, Tags tags) {
    if (meterRegistry != null) {
      meterRegistry.counter(name, tags).increment();
    }
  }

  private void recordTimer(String name, Duration duration, Tags tags) {
    if (meterRegistry != null) {
      Timer.builder(name).tags(tags).register(meterRegistry).record(duration);
    }
  }

  private Duration safe(Duration duration) {
    if (duration == null || duration.isNegative()) {
      return Duration.ZERO;
    }
    return duration;
  }

  private String value(String value) {
    if (value == null || value.isBlank()) {
      return "n/a";
    }
    return value;
  }
}
