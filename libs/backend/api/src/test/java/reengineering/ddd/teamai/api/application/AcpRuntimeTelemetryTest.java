package reengineering.ddd.teamai.api.application;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

class AcpRuntimeTelemetryTest {

  @Test
  void should_record_session_create_and_prompt_metrics() {
    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    AcpRuntimeTelemetry telemetry = new AcpRuntimeTelemetry(meterRegistry);

    telemetry.sessionCreateResult(
        "project-1", "session-1", "user-1", "success", Duration.ofMillis(30), null, null);
    telemetry.promptResult("session-1", "success", Duration.ofMillis(200), null, null, false);
    telemetry.promptErrorDistribution("provider", "PROVIDER_PROCESS_EXITED", true);

    double createCounter =
        meterRegistry
            .get("teamai.acp.session.create.total")
            .tags("outcome", "success", "errorCategory", "n/a", "errorCode", "n/a")
            .counter()
            .count();
    double promptCounter =
        meterRegistry
            .get("teamai.acp.prompt.total")
            .tags(
                "outcome",
                "success",
                "errorCategory",
                "n/a",
                "errorCode",
                "n/a",
                "retryable",
                "false")
            .counter()
            .count();
    double distributionCounter =
        meterRegistry
            .get("teamai.acp.prompt.error.distribution")
            .tags("category", "provider", "code", "PROVIDER_PROCESS_EXITED", "retryable", "true")
            .counter()
            .count();

    assertThat(createCounter).isEqualTo(1.0d);
    assertThat(promptCounter).isEqualTo(1.0d);
    assertThat(distributionCounter).isEqualTo(1.0d);
  }

  @Test
  void should_reuse_existing_trace_id() {
    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    AcpRuntimeTelemetry telemetry = new AcpRuntimeTelemetry(meterRegistry);
    MDC.put("traceId", "trace-fixed-acp-1");

    try {
      String traceId = telemetry.ensureTraceId();
      telemetry.promptResult(
          "session-2", "failure", Duration.ofMillis(50), "runtime", "RUNTIME_TIMEOUT", true);

      assertThat(traceId).isEqualTo("trace-fixed-acp-1");
      assertThat(MDC.get("traceId")).isEqualTo("trace-fixed-acp-1");
    } finally {
      MDC.remove("traceId");
    }
  }
}
