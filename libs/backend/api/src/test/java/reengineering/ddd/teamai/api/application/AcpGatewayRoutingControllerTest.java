package reengineering.ddd.teamai.api.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class AcpGatewayRoutingControllerTest {

  @Test
  void should_switch_mode_without_restart() {
    AtomicLong now = new AtomicLong(1_000L);
    AcpGatewayRoutingController controller =
        new AcpGatewayRoutingController("local", 3, 60_000, 120_000, now::get);

    assertThat(controller.requestedMode()).isEqualTo("local");
    assertThat(controller.effectiveMode()).isEqualTo("local");

    controller.updateMode("remote");

    assertThat(controller.requestedMode()).isEqualTo("remote");
    assertThat(controller.effectiveMode()).isEqualTo("remote");
  }

  @Test
  void should_auto_rollback_to_local_when_remote_failures_exceed_threshold() {
    AtomicLong now = new AtomicLong(10_000L);
    AcpGatewayRoutingController controller =
        new AcpGatewayRoutingController("remote", 2, 60_000, 20_000, now::get);

    controller.recordRemoteFailure(new RuntimeException("failed-1"));
    assertThat(controller.effectiveMode()).isEqualTo("remote");

    controller.recordRemoteFailure(new RuntimeException("failed-2"));
    assertThat(controller.effectiveMode()).isEqualTo("local");
    assertThat(controller.forcedLocalUntilEpochMs()).isGreaterThan(now.get());

    now.addAndGet(20_001L);
    assertThat(controller.effectiveMode()).isEqualTo("remote");
  }
}
