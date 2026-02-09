package reengineering.ddd.teamai.infrastructure.providers;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DeepSeekModelProviderTest {

  private DeepSeekModelProvider provider;

  @BeforeEach
  void setUp() {
    provider = new DeepSeekModelProvider();
  }

  @Test
  void should_implement_model_provider_interface() {
    assertThat(provider)
        .isInstanceOf(com.businessdrivenai.domain.model.Conversation.ModelProvider.class);
  }

  @Test
  void should_return_non_null_flux_for_valid_api_key() {
    // Note: This test only verifies the method returns a Flux without actually
    // calling the API. A real integration test would require a valid API key.
    var result = provider.sendMessage("test message", "test-api-key");
    assertThat(result).isNotNull();
  }
}
