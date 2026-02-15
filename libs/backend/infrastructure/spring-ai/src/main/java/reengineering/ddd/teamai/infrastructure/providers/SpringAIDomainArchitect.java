package reengineering.ddd.teamai.infrastructure.providers;

import com.alibaba.cloud.ai.graph.agent.ReactAgent;
import com.alibaba.cloud.ai.graph.exception.GraphRunnerException;
import java.util.Arrays;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.ai.deepseek.DeepSeekChatModel;
import org.springframework.ai.deepseek.api.DeepSeekApi;
import reengineering.ddd.teamai.description.DraftDiagram;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.model.Diagram;

public class SpringAIDomainArchitect implements Diagram.DomainArchitect, RequestHeaderModelConfig {
  private static final String DEFAULT_MODEL = "deepseek-chat";

  @Override
  public DraftDiagram proposeModel(String requirement) {
    return analyzeAndGenerateModel(requirement);
  }

  private DraftDiagram analyzeAndGenerateModel(String requirement) {
    String prompt = buildAnalysisPrompt(requirement);
    String apiKey = resolveApiKey();
    String model = resolveModel(DEFAULT_MODEL);

    DeepSeekApi api = DeepSeekApi.builder().apiKey(apiKey).build();
    DeepSeekChatModel chatModel =
        DeepSeekChatModel.builder()
            .deepSeekApi(api)
            .defaultOptions(
                org.springframework.ai.deepseek.DeepSeekChatOptions.builder().model(model).build())
            .build();

    ReactAgent architectAgent =
        ReactAgent.builder()
            .name("domain-architect")
            .model(chatModel)
            .instruction(prompt)
            .outputType(DraftDiagram.class)
            .build();

    try {
      AssistantMessage result = architectAgent.call(requirement);
      return new BeanOutputConverter<>(DraftDiagram.class).convert(result.getText());
    } catch (GraphRunnerException e) {
      throw new IllegalStateException("Failed to generate domain model with ReactAgent", e);
    } catch (RuntimeException e) {
      throw new IllegalStateException("Failed to parse DraftDiagram from agent response", e);
    }
  }

  private String buildAnalysisPrompt(String requirement) {
    String allowedTypes =
        String.join(
            ", ", Arrays.stream(LogicalEntityDescription.Type.values()).map(Enum::name).toList());
    return """
                请分析以下软件需求，并提供详细的领域模型分析：

                需求：%s

                请基于需求分析创建一个领域模型 Diagram，包含：
                1. 识别核心领域概念作为 Node，每个 Node 应该有 name、label 和 type（type 必须使用 LogicalEntityDescription.Type 枚举值：%s）
                2. 定义领域对象之间的关系作为 Edge，每个 Edge 有 sourceNode 和 targetNode

                请确保结果严格符合 JSON 格式要求，不要包含额外的文本或解释。
                """
        .formatted(requirement, allowedTypes);
  }
}
