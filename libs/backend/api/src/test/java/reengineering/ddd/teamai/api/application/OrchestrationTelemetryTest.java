package reengineering.ddd.teamai.api.application;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import org.junit.jupiter.api.Test;

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
}
