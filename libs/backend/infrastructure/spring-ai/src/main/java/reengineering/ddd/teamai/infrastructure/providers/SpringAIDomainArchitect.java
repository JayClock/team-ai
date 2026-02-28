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
                1. 合同上下文优先：先识别 Contract（合同）及其关键 Party Role。Participant（Party）仅作为可选补充信息，不再作为主建模入口。
                2. Party 角色化：优先为每个业务主体抽取 Party Role 并连接到 Contract；仅在需要显式表达主体实体时，再补充 Participant（Party）并体现 Participant（Party） -> Party Role -> Contract。
                3. 售前凭证：按需识别 RFP（要约邀请）与 Proposal（报价/提案）。
                4. 主要履约项：围绕合同责任，按「Fulfillment Request -> Fulfillment Confirmation」成对建模。
                5. 异常与违约：补充退款、取消、服务中止等逆向履约对（Request -> Confirmation）。
                6. 角色拆分总则：按业务意图补齐 Role；Party Role、Evidence As Role 及 Third/Context 参与边界分别以第 2、9、10 条为准。对 Domain Logic、Third Party 必须先思考“在没有软件时代由什么真实岗位承担该工作”，再据此生成拟人化角色命名（职位/岗位语义），避免纯技术命名。
                7. 参与方判定：新增 RFP、Proposal、Fulfillment Request、Fulfillment Confirmation、Other Evidence 时，必须先思考并明确唯一的 Party Role 参与再连线；上述每个节点必须有一个 Party Role 参与。
                8. 通用凭证/副产品：当确认动作产生具体业务单据（如发票、发货单）时，先建模为 Fulfillment Confirmation -> Other Evidence（EVIDENCE 节点，通常 1 对 1）。
                9. 跨上下文角色：当第 8 条中的 Other Evidence 需要跨越边界触发另一个上下文协作或次级合同时，必须将其转化为 ROLE（Evidence As Role），并可选连接到另一个 Contract 上下文中的 Fulfillment Confirmation。Evidence As Role 的所属 Context 必须继承其原始 Other Evidence 的生成来源 Fulfillment Confirmation（source confirmation）的 Context，禁止重新归属到其他 Context。同一业务语义在同一张图中只能保留一个节点表示（Other Evidence 与 Evidence As Role 二选一，禁止并存）。
                10. 角色参与约束：Third Party Role、Context Role 只能参与 Other Evidence 或 Evidence As Role，不得直接参与 RFP、Proposal、Contract、Fulfillment Request、Fulfillment Confirmation。
                11. 多合同上下文处理：若需求涉及多个 Contract 上下文，必须按“一合同一主链”分别建模；并且每个合同上下文都必须独立、完整遵循本流程第 1-10 条（合同识别、参与方角色化、凭证主线、角色约束、Evidence As Role 规则均不可省略或合并）。每个 Context 节点应包裹该上下文内从 RFP 到终点节点（Other Evidence 或 Evidence As Role）的全部相关节点；当终点为 Evidence As Role 时，将其作为上下文划分边界标记。Context 内不包含 Participant（Party），若需要补充主体实体信息，应将 Participant（Party）放在 Context 外并连接到对应 Party Role。涉及多个 Contract 时，必须先进行主体同一性判断：同一真实主体可在不同上下文扮演不同 Party Role（同一 Participant 的不同“马甲”），例如“商品采购合同中的客户 Party Role”与“微信支付合同中的微信用户 Party Role”可归属于同一 Participant（Party）。多个 Contract 上下文之间只允许通过 Fulfillment Confirmation 与 Evidence As Role 进行桥接（Fulfillment Confirmation -> Evidence As Role -> Fulfillment Confirmation）；禁止 Contract 与 Contract、Contract 与对方主链节点直接连线。
                12. 边界与流转：通过 Edge 明确凭证流转、角色参与、上下文协作，体现业务控制流与领域计算逻辑解耦。

                Node 生成规则：
                1. 每个 Node 必须有唯一虚拟 id（建议 node-1、node-2...），并包含 parent、name、label、type、subType。
                   - 根节点必须设置 parent=null
                   - 子节点必须设置 parent.id=<父节点id>
                2. type 只能使用以下枚举值：%s
                3. type 映射建议：
                   - EVIDENCE：RFP、Proposal、Contract、Fulfillment Request、Fulfillment Confirmation、Other Evidence（仅限不跨上下文的内部产物）
                   - PARTICIPANT：Party、Thing
                   - ROLE：Party、Domain Logic、Third Party、Context，以及 Evidence As Role（跨上下文凭证角色，当前值通常为 evidence_role）
                   - CONTEXT：相关业务上下文（如库存、支付、发票等）
                4. subType 必须与 type 匹配，并使用以下子类型值（仅 value，不带前缀）：
                   - EVIDENCE -> %s
                   - PARTICIPANT -> %s
                   - ROLE -> %s
                   - CONTEXT -> %s
                5. 请在 name 或 label 中体现凭证类别与关键时间语义（如 started_at/expired_at/confirmed_at/signed_at/created_at）。特别是 OTHER_EVIDENCE 与 Evidence As Role 均建议携带 created_at。对于 Domain Logic、Third Party 的 ROLE 命名，必须使用拟人化职位/岗位语义（先完成“无软件时代真实岗位”映射），禁止使用纯技术组件名（如规则引擎、风控服务、支付SDK等）直接命名。
                6. Context 包裹规则：当节点 type=CONTEXT 时必须作为容器父节点，并包裹本上下文从 RFP 到终点节点（Other Evidence 或 Evidence As Role）的全部相关节点（含对应 Request/Confirmation/Role，不包含 Participant（Party））；当出现 Evidence As Role 时，可将其作为上下文划分边界标记。Evidence As Role 的 parent.id 必须与其“原始 Other Evidence 的生成来源 Fulfillment Confirmation”保持一致（同 Context）；若后续还连接了其他 Fulfillment Confirmation，也不得改变该归属。若需要补充 Participant（Party），应放在 Context 外并连接到对应 Party Role。

                反例（禁止）：
                - 错误示例：同一业务语义同时建模为 “xxx(Other Evidence)” 和 “xxx角色(Evidence As Role)” 并在图中并存。
                - 正确做法：同语义节点二选一。仅在本上下文留存时使用 Other Evidence；需要跨上下文桥接时，将其转化为 Evidence As Role，并移除同语义 Other Evidence。

                Edge 生成规则：
                1. 每个 Edge 必须提供 sourceNode 和 targetNode，且 sourceNode.id / targetNode.id 必须引用已定义的 Node.id。
                2. 凭证主线必须遵循时间线与因果关系，优先体现：RFP -> Proposal -> Contract -> Fulfillment Request -> Fulfillment Confirmation。
                3. Proposal / Contract / Request 连线规则（强约束）：
                   - Proposal -> Contract：Contract 必须由已存在的 Proposal 驱动生成；同一 Contract 至少连接一个上游 Proposal。
                   - Contract -> Fulfillment Request：Fulfillment Request 必须以 Contract 作为直接前置来源，禁止脱离 Contract 独立出现。
                   - Proposal -X-> Fulfillment Request：禁止 Proposal 直接连接 Fulfillment Request，必须经由 Contract 中转（Proposal -> Contract -> Fulfillment Request）。
                4. Contract -> Fulfillment Request 通常为 1 对 N：同一合同应可分支到多个不同履约申请（支付、发票、发货、开通等）。
                5. Fulfillment Request -> Fulfillment Confirmation 必须成对，按 1 对 1 连接；异常链路（退费、取消、中止）同样遵循 Request -> Confirmation。如果涉及外部渠道二次响应，允许 Fulfillment Confirmation -> Fulfillment Confirmation 的级联。
                6. 若存在多个 Contract 上下文，必须对每个上下文分别维持完整 FM 主线（至少满足 Contract -> Fulfillment Request -> Fulfillment Confirmation，并按需补齐 RFP/Proposal）；跨合同桥接只能使用 Fulfillment Confirmation -> Evidence As Role -> Fulfillment Confirmation。禁止 Contract 与 Contract 直接连线，且禁止 Contract 直接连接到其他上下文的 Request/Confirmation。
                7. 参与者连接规则：
                   - Thing 通常连接到 Contract，并按需连接到 RFP/Proposal/Fulfillment Request。
                   - Party Role 是主路径：优先由 Party Role 参与并连接 Contract 与相关凭证；Participant（Party）仅在需要补充主体实体信息时出现，出现时连接 Participant（Party） -> Party Role。
                   - 当存在多个 Contract 上下文时，先判断 Party Role 是否属于同一真实主体：若属于同一主体，可使用一个 Context 外的 Participant（Party）连接多个 Party Role；若非同一主体，必须拆分为不同 Participant（Party）。
                8. 角色连接规则：
                   - 对 RFP、Proposal、Fulfillment Request、Fulfillment Confirmation、Other Evidence，必须显式判断并连接参与的 Party Role；每个节点只能连接一个 Party Role，且仅连接实际参与方。
                   - Domain Logic Role 连接到 RFP/Proposal/Request（作为领域计算器，只负责算价、算权益等规则计算）；命名需对应无软件时代真实岗位并采用拟人化职位语义。
                   - Third Party Role、Context Role 的参与范围遵循「流程建模第 10 条」约束；其中 Third Party Role 命名同样需先映射无软件时代真实岗位并采用拟人化职位语义。
                   - Evidence As Role 仅可由同语义 Other Evidence 转化而来，并可作为跨上下文桥接节点连接到另一个 Contract 上下文中的 Fulfillment Confirmation（强制链路：Fulfillment Confirmation -> Evidence As Role -> Fulfillment Confirmation）。其所属 Context 必须由原始 Other Evidence 的 source confirmation 决定；跨上下文连线不改变该归属。同一语义仅允许一个节点表示，禁止与同语义 Other Evidence 并存。
                9. 连线方向默认从“前序原因”指向“后序结果”或“发起方”指向“被发起动作”，避免无意义回环，保证图可以自左向右读出主干凭证流。

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
