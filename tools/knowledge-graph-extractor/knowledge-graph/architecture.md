```mermaid
graph TD
  %% 架构视图 - 三层架构

  %% 配置
---
config:
  theme: forest
  layout: elk
---

  %% 层节点
  subgraph API_LAYER["API Layer"]
    direction TB
    JAXRS_reengineering_ddd_teamai_api_UsersApi["reengineering.ddd.teamai.api.UsersApi<br/><small>JAXRSResource</small>"]
      click JAXRS_reengineering_ddd_teamai_api_UsersApi "file:////Users/zhongjie/Documents/GitHub/team-ai/libs/backend/api/src/main/java/reengineering/ddd/teamai/api/UsersApi.java" "跳转到源文件"
    JAXRS_reengineering_ddd_teamai_api_RootApi["reengineering.ddd.teamai.api.RootApi<br/><small>JAXRSResource</small>"]
      click JAXRS_reengineering_ddd_teamai_api_RootApi "file:////Users/zhongjie/Documents/GitHub/team-ai/libs/backend/api/src/main/java/reengineering/ddd/teamai/api/RootApi.java" "跳转到源文件"
  end

  subgraph DOMAIN_LAYER["Domain Layer"]
    direction TB
    ENTITY_reengineering_ddd_teamai_model_Conversation["reengineering.ddd.teamai.model.Conversation<br/><small>Entity</small>"]
      click ENTITY_reengineering_ddd_teamai_model_Conversation "file:////Users/zhongjie/Documents/GitHub/team-ai/libs/backend/domain/src/main/java/reengineering/ddd/teamai/model/Conversation.java" "跳转到源文件"
    ENTITY_reengineering_ddd_teamai_model_User["reengineering.ddd.teamai.model.User<br/><small>Entity</small>"]
      click ENTITY_reengineering_ddd_teamai_model_User "file:////Users/zhongjie/Documents/GitHub/team-ai/libs/backend/domain/src/main/java/reengineering/ddd/teamai/model/User.java" "跳转到源文件"
    ENTITY_reengineering_ddd_teamai_model_Account["reengineering.ddd.teamai.model.Account<br/><small>Entity</small>"]
      click ENTITY_reengineering_ddd_teamai_model_Account "file:////Users/zhongjie/Documents/GitHub/team-ai/libs/backend/domain/src/main/java/reengineering/ddd/teamai/model/Account.java" "跳转到源文件"
    ENTITY_reengineering_ddd_teamai_model_Message["reengineering.ddd.teamai.model.Message<br/><small>Entity</small>"]
      click ENTITY_reengineering_ddd_teamai_model_Message "file:////Users/zhongjie/Documents/GitHub/team-ai/libs/backend/domain/src/main/java/reengineering/ddd/teamai/model/Message.java" "跳转到源文件"
  end

  subgraph INFRASTRUCTURE_LAYER["Infrastructure Layer"]
    direction TB
  end

  %% 跨层关系
```
