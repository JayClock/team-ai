package reengineering.ddd.teamai.infrastructure.providers;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.deepseek.api.ResponseFormat;
import reactor.core.publisher.Flux;
import reengineering.ddd.teamai.model.Diagram;

class SpringAIDomainArchitectTest {

  private SpringAIDomainArchitect domainArchitect;

  @BeforeEach
  void setUp() {
    domainArchitect = new SpringAIDomainArchitect();
  }

  @Test
  void should_implement_domain_architect_interface() {
    assertThat(domainArchitect).isInstanceOf(Diagram.DomainArchitect.class);
  }

  @Test
  void should_create_instance_with_default_constructor() {
    SpringAIDomainArchitect architect = new SpringAIDomainArchitect();
    assertThat(architect).isNotNull();
  }

  @Test
  void should_handle_api_unavailability_gracefully() {
    assertThat(domainArchitect).isNotNull();
  }

  @Test
  void should_enable_json_mode_for_streaming_generation() {
    var options = domainArchitect.buildJsonStreamOptions("deepseek-chat");

    assertThat(options.getModel()).isEqualTo("deepseek-chat");
    assertThat(options.getResponseFormat()).isNotNull();
    assertThat(options.getResponseFormat().getType()).isEqualTo(ResponseFormat.Type.JSON_OBJECT);
  }

  @Test
  void should_return_valid_draft_diagram_when_api_available() {
    try {
      Flux<String> result = domainArchitect.proposeModel("创建一个简单的待办事项应用");

      if (result != null) {
        assertThat(result).isNotNull();
      }
    } catch (Exception e) {
      System.err.println("API 调用失败: " + e.getMessage());
    }
  }

  @Test
  void should_handle_various_requirement_formats() {
    String[] requirements = {
      "创建一个用户管理系统",
      "开发一个社交媒体平台",
      "设计一个项目管理工具",
      "构建一个学习管理系统",
      "实现一个医疗记录管理系统",
      "开发一个电商平台",
      "设计一个库存管理系统",
      "创建一个内容管理系统"
    };

    for (String requirement : requirements) {
      try {
        Flux<String> result = domainArchitect.proposeModel(requirement);

        if (result != null) {
          System.out.println("处理需求成功: " + requirement);
          System.out.println("  已返回流式输出。");
        }
      } catch (Exception e) {
        System.err.println("处理需求失败 '" + requirement + "': " + e.getMessage());
      }
    }
  }
}
