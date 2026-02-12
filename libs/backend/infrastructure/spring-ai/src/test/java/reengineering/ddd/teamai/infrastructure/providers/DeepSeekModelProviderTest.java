package reengineering.ddd.teamai.infrastructure.providers;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

class DeepSeekModelProviderTest {

  private DeepSeekModelProvider provider;

  @BeforeEach
  void setUp() {
    provider = new DeepSeekModelProvider();
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.addHeader("X-Api-Key", "test-api-key");
    RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
  }

  @AfterEach
  void tearDown() {
    RequestContextHolder.resetRequestAttributes();
  }

  @Test
  void should_implement_model_provider_interface() {
    assertThat(provider)
        .isInstanceOf(reengineering.ddd.teamai.model.Conversation.ModelProvider.class);
  }

  @Test
  void should_return_non_null_flux_for_valid_api_key() {
    // Note: This test only verifies the method returns a Flux without actually
    // calling the API. A real integration test would require a valid API key.
    var result = provider.sendMessage("test message");
    assertThat(result).isNotNull();
  }
}
