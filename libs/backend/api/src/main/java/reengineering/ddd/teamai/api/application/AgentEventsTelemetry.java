package reengineering.ddd.teamai.api.application;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.Timer;
import jakarta.inject.Inject;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

@Component
public class AgentEventsTelemetry {
  private static final Logger log = LoggerFactory.getLogger(AgentEventsTelemetry.class);
  private final MeterRegistry meterRegistry;
  private final AtomicInteger activeConnections;

  @Inject
  public AgentEventsTelemetry(ObjectProvider<MeterRegistry> meterRegistryProvider) {
    this(meterRegistryProvider.getIfAvailable());
  }

  AgentEventsTelemetry(MeterRegistry meterRegistry) {
    this.meterRegistry = meterRegistry;
    this.activeConnections = new AtomicInteger(0);
    if (meterRegistry != null) {
      Gauge.builder(
              "teamai.events.stream.connections.active", activeConnections, AtomicInteger::get)
          .register(meterRegistry);
    }
  }

  public static AgentEventsTelemetry noop() {
    return new AgentEventsTelemetry((MeterRegistry) null);
  }

  public String ensureTraceId() {
    String traceId = MDC.get("traceId");
    if (traceId == null || traceId.isBlank()) {
      traceId = UUID.randomUUID().toString();
      MDC.put("traceId", traceId);
    }
    return traceId;
  }

  public void connectionOpened(String projectId, String cursor, String cursorSource) {
    String traceId = ensureTraceId();
    int active = activeConnections.incrementAndGet();
    log.info(
        "event=agent_events_stream_open traceId={} projectId={} cursor={} cursorSource={} activeConnections={}",
        traceId,
        value(projectId),
        value(cursor),
        value(cursorSource),
        active);
    incrementCounter(
        "teamai.events.stream.connections.opened", Tags.of("cursorSource", value(cursorSource)));
  }

  public void connectionClosed(String projectId, String cursor, String cursorSource) {
    String traceId = ensureTraceId();
    int active = Math.max(0, activeConnections.decrementAndGet());
    log.info(
        "event=agent_events_stream_close traceId={} projectId={} cursor={} cursorSource={} activeConnections={}",
        traceId,
        value(projectId),
        value(cursor),
        value(cursorSource),
        active);
    incrementCounter(
        "teamai.events.stream.connections.closed", Tags.of("cursorSource", value(cursorSource)));
  }

  public void replay(String projectId, String cursorSource, int replayCount) {
    String traceId = ensureTraceId();
    log.info(
        "event=agent_events_stream_replay traceId={} projectId={} cursorSource={} replayCount={}",
        traceId,
        value(projectId),
        value(cursorSource),
        replayCount);
    incrementCounter(
        "teamai.events.stream.replay.count", Tags.of("cursorSource", value(cursorSource)));
  }

  public void delivered(String projectId, String eventType, Instant occurredAt) {
    incrementCounter(
        "teamai.events.stream.events.delivered", Tags.of("eventType", value(eventType)));
    if (meterRegistry != null && occurredAt != null) {
      Duration lag = Duration.between(occurredAt, Instant.now());
      if (!lag.isNegative()) {
        Timer.builder("teamai.events.stream.delivery.lag")
            .tags("eventType", value(eventType))
            .register(meterRegistry)
            .record(lag);
      }
    }
    log.debug(
        "event=agent_events_stream_delivered traceId={} projectId={} eventType={}",
        ensureTraceId(),
        value(projectId),
        value(eventType));
  }

  public void heartbeat(String projectId, String latestEventId) {
    incrementCounter("teamai.events.stream.heartbeat", Tags.empty());
    log.debug(
        "event=agent_events_stream_heartbeat traceId={} projectId={} latestEventId={}",
        ensureTraceId(),
        value(projectId),
        value(latestEventId));
  }

  public void streamError(String projectId, String code, String message, Throwable error) {
    incrementCounter("teamai.events.stream.error", Tags.of("code", value(code)));
    log.warn(
        "event=agent_events_stream_error traceId={} projectId={} code={} message={}",
        ensureTraceId(),
        value(projectId),
        value(code),
        value(message),
        error);
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
