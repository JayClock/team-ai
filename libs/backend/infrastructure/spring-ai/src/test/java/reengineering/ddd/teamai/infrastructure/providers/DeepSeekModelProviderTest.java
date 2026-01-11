package reengineering.ddd.teamai.infrastructure.providers;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.ai.chat.client.ChatClient;
import reactor.core.publisher.Flux;
import reactor.test.StepVerifier;

@ExtendWith(MockitoExtension.class)
class DeepSeekModelProviderTest {

  @Mock private ChatClient chatClient;

  @Mock private ChatClient.ChatClientRequestSpec requestSpec;

  @Mock private ChatClient.ChatClientRequestSpec userSpec;

  @Mock private ChatClient.StreamResponseSpec streamSpec;

  private DeepSeekModelProvider provider;

  @BeforeEach
  void setUp() {
    provider = new DeepSeekModelProvider(chatClient);
  }

  @Test
  void should_send_message_and_return_streaming_response() {
    String userMessage = "Hello, AI!";
    Flux<String> expectedResponse = Flux.just("Hello", " there", "!");

    when(chatClient.prompt()).thenReturn(requestSpec);
    when(requestSpec.user(userMessage)).thenReturn(userSpec);
    when(userSpec.stream()).thenReturn(streamSpec);
    when(streamSpec.content()).thenReturn(expectedResponse);

    Flux<String> result = provider.sendMessage(userMessage);

    StepVerifier.create(result)
        .expectNext("Hello")
        .expectNext(" there")
        .expectNext("!")
        .verifyComplete();

    verify(chatClient).prompt();
    verify(requestSpec).user(userMessage);
    verify(userSpec).stream();
    verify(streamSpec).content();
  }

  @Test
  void should_handle_empty_message() {
    String emptyMessage = "";
    Flux<String> expectedResponse = Flux.just("I didn't receive any message.");

    when(chatClient.prompt()).thenReturn(requestSpec);
    when(requestSpec.user(emptyMessage)).thenReturn(userSpec);
    when(userSpec.stream()).thenReturn(streamSpec);
    when(streamSpec.content()).thenReturn(expectedResponse);

    Flux<String> result = provider.sendMessage(emptyMessage);

    StepVerifier.create(result).expectNext("I didn't receive any message.").verifyComplete();
  }

  @Test
  void should_handle_long_message() {
    String longMessage = "A".repeat(10000);
    Flux<String> expectedResponse = Flux.just("Response to long message");

    when(chatClient.prompt()).thenReturn(requestSpec);
    when(requestSpec.user(longMessage)).thenReturn(userSpec);
    when(userSpec.stream()).thenReturn(streamSpec);
    when(streamSpec.content()).thenReturn(expectedResponse);

    Flux<String> result = provider.sendMessage(longMessage);

    StepVerifier.create(result).expectNext("Response to long message").verifyComplete();
  }

  @Test
  void should_handle_multiple_chunks_in_response() {
    String userMessage = "Tell me a story";
    Flux<String> chunkedResponse =
        Flux.just("Once", " upon", " a", " time", ",", " there", " was", " a", " developer", ".");

    when(chatClient.prompt()).thenReturn(requestSpec);
    when(requestSpec.user(userMessage)).thenReturn(userSpec);
    when(userSpec.stream()).thenReturn(streamSpec);
    when(streamSpec.content()).thenReturn(chunkedResponse);

    Flux<String> result = provider.sendMessage(userMessage);

    StepVerifier.create(result.reduce(String::concat))
        .expectNext("Once upon a time, there was a developer.")
        .verifyComplete();
  }
}
