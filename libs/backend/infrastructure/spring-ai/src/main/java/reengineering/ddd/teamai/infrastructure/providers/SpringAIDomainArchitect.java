package reengineering.ddd.teamai.infrastructure.providers;

import java.util.Arrays;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.ai.deepseek.DeepSeekChatModel;
import org.springframework.ai.deepseek.DeepSeekChatOptions;
import org.springframework.ai.deepseek.api.DeepSeekApi;
import org.springframework.ai.deepseek.api.ResponseFormat;
import reactor.core.publisher.Flux;
import reengineering.ddd.teamai.description.ContextSubType;
import reengineering.ddd.teamai.description.DraftDiagram;
import reengineering.ddd.teamai.description.EvidenceSubType;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.description.ParticipantSubType;
import reengineering.ddd.teamai.description.RoleSubType;
import reengineering.ddd.teamai.model.Diagram;

public class SpringAIDomainArchitect implements Diagram.DomainArchitect, RequestHeaderModelConfig {
  private static final String DEFAULT_MODEL = "deepseek-chat";

  @Override
  public Flux<String> proposeModel(String requirement) {
    return analyzeAndGenerateModel(requirement);
  }

  private Flux<String> analyzeAndGenerateModel(String requirement) {
    String apiKey = resolveApiKey();
    String model = resolveModel(DEFAULT_MODEL);

    DeepSeekApi api = DeepSeekApi.builder().apiKey(apiKey).build();
    DeepSeekChatModel chatModel =
        DeepSeekChatModel.builder()
            .deepSeekApi(api)
            .defaultOptions(buildJsonStreamOptions(model))
            .build();

    ChatClient chatClient = ChatClient.create(chatModel);
    BeanOutputConverter<DraftDiagram> outputConverter =
        new BeanOutputConverter<>(DraftDiagram.class);
    String prompt = buildAnalysisPrompt(requirement, outputConverter.getFormat());

    return chatClient.prompt().user(prompt).stream().content();
  }

  DeepSeekChatOptions buildJsonStreamOptions(String model) {
    ResponseFormat responseFormat =
        ResponseFormat.builder().type(ResponseFormat.Type.JSON_OBJECT).build();
    return DeepSeekChatOptions.builder().model(model).responseFormat(responseFormat).build();
  }

  private String buildAnalysisPrompt(String requirement, String outputFormat) {
    String allowedTypes =
        String.join(
            ", ", Arrays.stream(LogicalEntityDescription.Type.values()).map(Enum::name).toList());
    String evidenceSubTypes =
        String.join(
            ", ", Arrays.stream(EvidenceSubType.values()).map(EvidenceSubType::getValue).toList());
    String participantSubTypes =
        String.join(
            ", ",
            Arrays.stream(ParticipantSubType.values()).map(ParticipantSubType::getValue).toList());
    String roleSubTypes =
        String.join(", ", Arrays.stream(RoleSubType.values()).map(RoleSubType::getValue).toList());
    String contextSubTypes =
        String.join(
            ", ", Arrays.stream(ContextSubType.values()).map(ContextSubType::getValue).toList());
    return """
                请基于「履约建模法（Fulfillment Modeling, FM）」分析以下软件需求，并生成领域模型 Diagram：

                需求：%s

                请严格按以下 FM 流程建模：
                1. 合同上下文优先：先识别 Contract（合同）及其参与者 Participant（Party/Thing）。
                2. 售前凭证：按需识别 RFP（要约邀请）与 Proposal（报价/提案）。
                3. 主要履约项：围绕合同责任，按「Fulfillment Request -> Fulfillment Confirmation」成对建模。
                4. 异常与违约：补充退款、取消、服务中止等逆向履约对（Request -> Confirmation）。
                5. 角色拆分：围绕每个凭证补齐 Role，区分 Party Role、Domain Logic Role（只负责规则/算法计算）、Third Party Role、Context Role。
                6. 边界与流转：通过 Edge 明确凭证流转、角色参与、上下文协作，体现业务控制流与领域计算逻辑解耦。

                Node 生成规则：
                1. 每个 Node 必须有唯一虚拟 id（建议 node-1、node-2...），并包含 parent、name、label、type、subType。
                   - 根节点必须设置 parent=null
                   - 子节点必须设置 parent.id=<父节点id>
                2. type 只能使用以下枚举值：%s
                3. type 映射建议：
                   - EVIDENCE：RFP、Proposal、Contract、Fulfillment Request、Fulfillment Confirmation、Other Evidence
                   - PARTICIPANT：Party、Thing
                   - ROLE：Party/Domain Logic/Third Party/Context 等执行角色
                   - CONTEXT：相关业务上下文（如库存、支付、发票等）
                4. subType 必须与 type 匹配，并使用以下子类型值（仅 value，不带前缀）：
                   - EVIDENCE -> %s
                   - PARTICIPANT -> %s
                   - ROLE -> %s
                   - CONTEXT -> %s
                5. 请在 name 或 label 中体现凭证类别与关键时间语义（如 started_at/expired_at/confirmed_at/signed_at/created_at）。
                6. 为了支持 Context 包裹节点：当节点 type=CONTEXT 时优先作为容器父节点，相关 Request/Confirmation/Role/Participant 可通过 parent.id 指向该 Context。

                Edge 生成规则：
                1. 每个 Edge 必须提供 sourceNode 和 targetNode，且 sourceNode.id / targetNode.id 必须引用已定义的 Node.id。
                2. 凭证主线必须遵循时间线与因果关系，优先体现：RFP -> Proposal -> Contract -> Fulfillment Request -> Fulfillment Confirmation。
                3. Contract -> Fulfillment Request 通常为 1 对 N：同一合同应可分支到多个不同履约申请（支付、发票、发货、开通等）。
                4. Fulfillment Request -> Fulfillment Confirmation 必须成对，按 1 对 1 连接；异常链路（退费、取消、中止）同样遵循 Request -> Confirmation。
                5. Fulfillment Confirmation -> Evidence 通常为 1 对 1，用于表示确认后生成的单据/凭证（如支付凭证、发货单）。
                6. 参与者连接规则：
                   - Thing 通常连接到 Contract，并按需连接到 RFP/Proposal。
                   - Party 必须连接到 Contract，明确缔约方归属。
                7. 角色连接规则：
                   - Party Role 连接到对应 Fulfillment Request（谁发起申请）。
                   - Domain Logic Role 连接到 RFP/Proposal/Request（只负责规则与算法计算）。
                   - Third Party Role 通常连接到 Fulfillment Confirmation 或 Evidence（外部系统执行/生成）。
                   - Context Role 通常连接到 Fulfillment Confirmation 或 Evidence（内部业务上下文协作）。
                8. 连线方向默认从“前序原因”指向“后序结果”，避免无意义回环，保证图可以读出主干凭证流。

                输出必须严格遵守以下结构化格式（不要输出额外文本，不要 Markdown 代码块，不要解释）：
                %s
                """
        .formatted(
            requirement,
            allowedTypes,
            evidenceSubTypes,
            participantSubTypes,
            roleSubTypes,
            contextSubTypes,
            outputFormat);
  }
}
