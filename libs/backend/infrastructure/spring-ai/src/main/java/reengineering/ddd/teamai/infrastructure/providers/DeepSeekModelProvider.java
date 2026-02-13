package reengineering.ddd.teamai.infrastructure.providers;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.deepseek.DeepSeekChatModel;
import org.springframework.ai.deepseek.DeepSeekChatOptions;
import org.springframework.ai.deepseek.api.DeepSeekApi;
import reactor.core.publisher.Flux;
import reengineering.ddd.teamai.model.Conversation;

/** DeepSeek model provider implementation */
public class DeepSeekModelProvider implements Conversation.ModelProvider, RequestHeaderModelConfig {
  private static final String DEFAULT_MODEL = "deepseek-chat";

  @Override
  public Flux<String> sendMessage(String message) {
    String apiKey = resolveApiKey();
    DeepSeekApi api = DeepSeekApi.builder().apiKey(apiKey).build();

    DeepSeekChatModel chatModel = DeepSeekChatModel.builder().deepSeekApi(api).build();

    ChatClient chatClient = ChatClient.create(chatModel);
    String resolvedModel = resolveModel(DEFAULT_MODEL);

    return chatClient
        .prompt()
        .options(DeepSeekChatOptions.builder().model(resolvedModel).build())
        .user(message)
        .stream()
        .content();
  }
}
