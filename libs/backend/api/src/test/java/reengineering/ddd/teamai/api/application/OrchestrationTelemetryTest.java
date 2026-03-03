package reengineering.ddd.teamai.api.application;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

class OrchestrationTelemetryTest {

  @Test
  void should_record_session_and_step_transition_metrics() {
    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    OrchestrationTelemetry telemetry = new OrchestrationTelemetry(meterRegistry);

    telemetry.sessionTransition("s1", "t1", "a1", "PENDING", "RUNNING", "start");
    telemetry.stepTransition("s1", "step-1", "t1", "a1", "IN_PROGRESS");

    double sessionCounter =
        meterRegistry
            .get("teamai.orchestration.session.transition")
            .tags("from", "PENDING", "to", "RUNNING")
            .counter()
            .count();
    double stepCounter =
        meterRegistry
            .get("teamai.orchestration.step.transition")
            .tags("to", "IN_PROGRESS")
            .counter()
            .count();

    assertThat(sessionCounter).isEqualTo(1.0d);
    assertThat(stepCounter).isEqualTo(1.0d);
  }

  @Test
  void should_record_runtime_latency_and_result_metrics() {
    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    OrchestrationTelemetry telemetry = new OrchestrationTelemetry(meterRegistry);

    telemetry.runtimeResult("s1", "t1", "a1", "success", Duration.ofMillis(120));

    double resultCounter =
        meterRegistry
            .get("teamai.orchestration.runtime.result")
            .tags("outcome", "success")
            .counter()
            .count();
    long timerCount =
        meterRegistry
            .get("teamai.orchestration.runtime.latency")
            .tags("outcome", "success")
            .timer()
            .count();

    assertThat(resultCounter).isEqualTo(1.0d);
    assertThat(timerCount).isEqualTo(1L);
  }

  @Test
  void should_record_step_duration_and_runtime_error_tags() {
    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    OrchestrationTelemetry telemetry = new OrchestrationTelemetry(meterRegistry);

    telemetry.stepDuration("s1", "step-1", "t1", "a1", "success", Duration.ofMillis(40));
    telemetry.runtimeError("s1", "t1", "a1", "timeout", new IllegalStateException("boom"));
    telemetry.runtimeRetry("s1", "t1", "a1", 2, "retry because timeout");

    long stepDurationCount =
        meterRegistry
            .get("teamai.orchestration.step.duration")
            .tags("outcome", "success")
            .timer()
            .count();
    double runtimeErrorCounter =
        meterRegistry
            .get("teamai.orchestration.runtime.error")
            .tags("exception", "IllegalStateException", "category", "runtime")
            .counter()
            .count();
    double runtimeRetryCounter =
        meterRegistry
            .get("teamai.orchestration.runtime.retry")
            .tags("attempt", "2")
            .counter()
            .count();

    assertThat(stepDurationCount).isEqualTo(1L);
    assertThat(runtimeErrorCounter).isEqualTo(1.0d);
    assertThat(runtimeRetryCounter).isEqualTo(1.0d);
  }

  @Test
  void should_reuse_existing_trace_id_from_mdc() {
    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    OrchestrationTelemetry telemetry = new OrchestrationTelemetry(meterRegistry);
    MDC.put("traceId", "trace-fixed-1");

    try {
      String traceId = telemetry.ensureTraceId();
      telemetry.sessionTransition("s1", "t1", "a1", "PENDING", "RUNNING", "start");

      assertThat(traceId).isEqualTo("trace-fixed-1");
      assertThat(MDC.get("traceId")).isEqualTo("trace-fixed-1");
    } finally {
      MDC.remove("traceId");
    }
  }
}
