package reengineering.ddd.teamai.infrastructure.providers;

import com.businessdrivenai.domain.model.Conversation;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.deepseek.DeepSeekChatModel;
import org.springframework.ai.deepseek.api.DeepSeekApi;
import reactor.core.publisher.Flux;

/** DeepSeek model provider implementation */
public class DeepSeekModelProvider implements Conversation.ModelProvider {

  @Override
  public Flux<String> sendMessage(String message, String apiKey) {
    DeepSeekApi api = DeepSeekApi.builder().apiKey(apiKey).build();

    DeepSeekChatModel chatModel = DeepSeekChatModel.builder().deepSeekApi(api).build();

    ChatClient chatClient = ChatClient.create(chatModel);

    return chatClient.prompt().user(message).stream().content();
  }
}
