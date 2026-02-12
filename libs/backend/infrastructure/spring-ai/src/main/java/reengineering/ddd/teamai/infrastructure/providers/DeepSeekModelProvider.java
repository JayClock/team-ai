package reengineering.ddd.teamai.infrastructure.providers;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.deepseek.DeepSeekChatModel;
import org.springframework.ai.deepseek.DeepSeekChatOptions;
import org.springframework.ai.deepseek.api.DeepSeekApi;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import reactor.core.publisher.Flux;
import reengineering.ddd.teamai.model.ApiKeyMissingException;
import reengineering.ddd.teamai.model.Conversation;

/** DeepSeek model provider implementation */
public class DeepSeekModelProvider implements Conversation.ModelProvider {
  private static final String API_KEY_HEADER = "X-Api-Key";
  private static final String MODEL_HEADER = "X-AI-Model";
  private static final String DEFAULT_MODEL = "deepseek-chat";

  @Override
  public Flux<String> sendMessage(String message) {
    String apiKey = resolveApiKey();
    DeepSeekApi api = DeepSeekApi.builder().apiKey(apiKey).build();

    DeepSeekChatModel chatModel = DeepSeekChatModel.builder().deepSeekApi(api).build();

    ChatClient chatClient = ChatClient.create(chatModel);
    String resolvedModel = resolveModel();

    return chatClient
        .prompt()
        .options(DeepSeekChatOptions.builder().model(resolvedModel).build())
        .user(message)
        .stream()
        .content();
  }

  private String resolveModel() {
    if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs)) {
      return DEFAULT_MODEL;
    }
    String model = attrs.getRequest().getHeader(MODEL_HEADER);
    if (model == null || model.isBlank()) {
      return DEFAULT_MODEL;
    }
    return model.trim();
  }

  private String resolveApiKey() {
    if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs)) {
      throw new ApiKeyMissingException();
    }
    String apiKey = attrs.getRequest().getHeader(API_KEY_HEADER);
    if (apiKey == null || apiKey.isBlank()) {
      throw new ApiKeyMissingException();
    }
    return apiKey.trim();
  }
}
