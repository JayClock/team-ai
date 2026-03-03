package reengineering.ddd.teamai.api.application;

import jakarta.inject.Inject;
import java.time.Instant;
import java.util.Locale;
import java.util.Objects;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Runtime routing controller for ACP gateway migration.
 *
 * <p>Supports runtime mode switching and automatic rollback to local mode when remote error rate
 * exceeds configured thresholds.
 */
@Component
public class AcpGatewayRoutingController {
  private final AtomicReference<String> requestedMode = new AtomicReference<>("local");
  private final int rollbackErrorThreshold;
  private final long rollbackWindowMs;
  private final long rollbackCooldownMs;
  private final LongSupplier clock;

  private final ConcurrentLinkedDeque<Long> remoteFailureEpochMs = new ConcurrentLinkedDeque<>();
  private final AtomicLong forcedLocalUntilEpochMs = new AtomicLong(0L);

  @Inject
  public AcpGatewayRoutingController(
      @Value("${team-ai.acp.gateway.mode:local}") String initialMode,
      @Value("${team-ai.acp.gateway.rollback.error-threshold:5}") int rollbackErrorThreshold,
      @Value("${team-ai.acp.gateway.rollback.window-ms:60000}") long rollbackWindowMs,
      @Value("${team-ai.acp.gateway.rollback.cooldown-ms:300000}") long rollbackCooldownMs) {
    this(
        initialMode,
        rollbackErrorThreshold,
        rollbackWindowMs,
        rollbackCooldownMs,
        System::currentTimeMillis);
  }

  AcpGatewayRoutingController(
      String initialMode,
      int rollbackErrorThreshold,
      long rollbackWindowMs,
      long rollbackCooldownMs,
      LongSupplier clock) {
    this.rollbackErrorThreshold = Math.max(1, rollbackErrorThreshold);
    this.rollbackWindowMs = Math.max(1000L, rollbackWindowMs);
    this.rollbackCooldownMs = Math.max(1000L, rollbackCooldownMs);
    this.clock = Objects.requireNonNullElse(clock, System::currentTimeMillis);
    this.requestedMode.set(normalizeMode(initialMode));
  }

  public String requestedMode() {
    return requestedMode.get();
  }

  public synchronized void updateMode(String mode) {
    String normalized = normalizeMode(mode);
    requestedMode.set(normalized);
    if (!"remote".equals(normalized)) {
      clearRollbackState();
    }
  }

  public boolean shouldUseRemote() {
    if (!"remote".equals(requestedMode.get())) {
      return false;
    }
    long now = clock.getAsLong();
    return now >= forcedLocalUntilEpochMs.get();
  }

  public String effectiveMode() {
    return shouldUseRemote() ? "remote" : "local";
  }

  public void recordRemoteSuccess() {
    if (!"remote".equals(requestedMode.get())) {
      return;
    }
    trimOldFailures(clock.getAsLong());
  }

  public void recordRemoteFailure(RuntimeException ignored) {
    if (!"remote".equals(requestedMode.get())) {
      return;
    }
    long now = clock.getAsLong();
    remoteFailureEpochMs.addLast(now);
    trimOldFailures(now);
    if (remoteFailureEpochMs.size() >= rollbackErrorThreshold) {
      forcedLocalUntilEpochMs.set(now + rollbackCooldownMs);
      remoteFailureEpochMs.clear();
    }
  }

  public int remoteFailureCountInWindow() {
    trimOldFailures(clock.getAsLong());
    return remoteFailureEpochMs.size();
  }

  public long forcedLocalUntilEpochMs() {
    return forcedLocalUntilEpochMs.get();
  }

  public String forcedLocalUntilIso() {
    long until = forcedLocalUntilEpochMs.get();
    if (until <= 0L || clock.getAsLong() >= until) {
      return null;
    }
    return Instant.ofEpochMilli(until).toString();
  }

  public int rollbackErrorThreshold() {
    return rollbackErrorThreshold;
  }

  public long rollbackWindowMs() {
    return rollbackWindowMs;
  }

  public long rollbackCooldownMs() {
    return rollbackCooldownMs;
  }

  private void trimOldFailures(long now) {
    long threshold = now - rollbackWindowMs;
    while (true) {
      Long first = remoteFailureEpochMs.peekFirst();
      if (first == null || first >= threshold) {
        break;
      }
      remoteFailureEpochMs.pollFirst();
    }
  }

  private void clearRollbackState() {
    remoteFailureEpochMs.clear();
    forcedLocalUntilEpochMs.set(0L);
  }

  private String normalizeMode(String mode) {
    String normalized = mode == null ? "local" : mode.trim().toLowerCase(Locale.ROOT);
    if ("local".equals(normalized) || "remote".equals(normalized)) {
      return normalized;
    }
    throw new IllegalArgumentException("Unsupported gateway mode: " + mode);
  }
}
