package reengineering.ddd.teamai.infrastructure.providers;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.deepseek.DeepSeekChatModel;
import org.springframework.ai.deepseek.api.DeepSeekApi;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.model.Diagram;

public class SpringAIDomainArchitect implements Diagram.DomainArchitect {

  @Override
  public DiagramDescription.DraftDiagram proposeModel(String requirement) {
    return analyzeAndGenerateModel(requirement);
  }

  private DiagramDescription.DraftDiagram analyzeAndGenerateModel(String requirement) {
    String prompt = buildAnalysisPrompt(requirement);

    DeepSeekApi api = DeepSeekApi.builder().build();
    DeepSeekChatModel chatModel = DeepSeekChatModel.builder().deepSeekApi(api).build();
    ChatClient chatClient = ChatClient.create(chatModel);

    return chatClient.prompt().user(prompt).call().entity(DiagramDescription.DraftDiagram.class);
  }

  private String buildAnalysisPrompt(String requirement) {
    String format =
        """
                请将分析结果格式化为严格的 JSON 格式，字段如下：
                {
                  "nodes": [
                    {
                      "localData": {
                        "name": "节点名称",
                        "label": "节点标签",
                        "type": "CONTEXT"
                      }
                    }
                  ],
                  "edges": [
                    {
                      "sourceNode": {"id": "源节点ID"},
                      "targetNode": {"id": "目标节点ID"}
                    }
                  ]
                }
                """;

    return """
                请分析以下软件需求，并提供详细的领域模型分析：

                需求：%s

                请基于需求分析创建一个领域模型 Diagram，包含：
                1. 识别核心领域概念作为 Node，每个 Node 应该有 name、label 和 type（使用 CONTEXT 类型）
                2. 定义领域对象之间的关系作为 Edge，每个 Edge 有 sourceNode 和 targetNode

                %s

                请确保结果严格符合 JSON 格式要求，不要包含额外的文本或解释。
                """
        .formatted(requirement, format);
  }
}
