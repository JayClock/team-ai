package reengineering.ddd.teamai.infrastructure.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Iterator;
import java.util.List;
import java.util.Optional;
import java.util.stream.StreamSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.Many;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.infrastructure.config.McpToolConfig;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Projects;

@SpringBootTest(
    classes = McpProtocolE2ETest.TestMcpApp.class,
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.ai.mcp.server.name=team-ai-mcp-test",
      "spring.ai.mcp.server.version=0.1.0-test",
      "spring.ai.mcp.server.protocol=STREAMABLE",
      "spring.ai.mcp.server.streamable-http.mcp-endpoint=/mcp",
      "spring.autoconfigure.exclude=org.springframework.ai.model.deepseek.autoconfigure.DeepSeekChatAutoConfiguration"
    })
class McpProtocolE2ETest {

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private Projects projects;

  private final ObjectMapper objectMapper = new ObjectMapper();

  @BeforeEach
  void setUp() {
    reset(projects);
    Project alpha = mock(Project.class);
    when(alpha.getIdentity()).thenReturn("p1");
    when(alpha.getDescription()).thenReturn(new ProjectDescription("Alpha Project"));
    when(projects.findAll()).thenReturn(manyOf(alpha));
  }

  @Test
  void should_initialize_and_list_tools() throws Exception {
    ResponseEntity<String> initializeResponse = rpc(initializePayload(), null);

    assertThat(initializeResponse.getStatusCode().is2xxSuccessful()).isTrue();
    String sessionId = initializeResponse.getHeaders().getFirst("Mcp-Session-Id");
    assertThat(sessionId).isNotBlank();

    JsonNode initializeBody = parseBody(initializeResponse);
    assertThat(initializeBody.path("jsonrpc").asText()).isEqualTo("2.0");
    assertThat(initializeBody.path("id").asText()).isEqualTo("init-1");
    assertThat(initializeBody.path("error").isMissingNode()).isTrue();
    assertThat(initializeBody.path("result").isObject()).isTrue();

    ResponseEntity<String> listToolsResponse =
        rpc(jsonRpc("tools-1", "tools/list", "{}"), sessionId);

    assertThat(listToolsResponse.getStatusCode().is2xxSuccessful()).isTrue();
    JsonNode listBody = parseBody(listToolsResponse);
    assertThat(listBody.path("jsonrpc").asText()).isEqualTo("2.0");
    assertThat(listBody.path("id").asText()).isEqualTo("tools-1");
    assertThat(listBody.path("error").isMissingNode()).isTrue();
    assertThat(toolNames(listBody))
        .contains(
            "list_projects",
            "list_agents",
            "create_agent",
            "list_tasks",
            "create_task",
            "delegate_task_to_agent",
            "submit_task_for_review",
            "approve_task",
            "request_task_fix",
            "list_agent_events");
  }

  @Test
  void should_call_list_projects_tool_after_initialize() throws Exception {
    ResponseEntity<String> initializeResponse = rpc(initializePayload(), null);
    String sessionId = initializeResponse.getHeaders().getFirst("Mcp-Session-Id");
    assertThat(sessionId).isNotBlank();

    String callParams = "{\"name\":\"list_projects\",\"arguments\":{}}";
    ResponseEntity<String> callResponse =
        rpc(jsonRpc("call-1", "tools/call", callParams), sessionId);

    assertThat(callResponse.getStatusCode().is2xxSuccessful()).isTrue();
    JsonNode callBody = parseBody(callResponse);
    assertThat(callBody.path("jsonrpc").asText()).isEqualTo("2.0");
    assertThat(callBody.path("id").asText()).isEqualTo("call-1");
    assertThat(callBody.path("error").isMissingNode()).isTrue();
    assertThat(callBody.toString()).contains("Alpha Project");
    assertThat(callBody.toString()).contains("p1");
  }

  @Test
  void should_require_session_id_for_follow_up_requests() {
    ResponseEntity<String> listToolsResponse = rpc(jsonRpc("tools-x", "tools/list", "{}"), null);

    assertThat(listToolsResponse.getStatusCode().is4xxClientError()).isTrue();
    assertThat(listToolsResponse.getBody()).containsIgnoringCase("session");
  }

  private ResponseEntity<String> rpc(String body, String sessionId) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.setAccept(List.of(MediaType.APPLICATION_JSON, MediaType.TEXT_EVENT_STREAM));
    headers.set("MCP-Protocol-Version", "2025-06-18");
    if (sessionId != null) {
      headers.set("Mcp-Session-Id", sessionId);
    }
    return restTemplate.postForEntity("/mcp", new HttpEntity<>(body, headers), String.class);
  }

  private JsonNode parseBody(ResponseEntity<String> response) throws Exception {
    String body = response.getBody();
    assertThat(body).isNotBlank();

    String trimmed = body.trim();
    if (trimmed.startsWith("{")) {
      return objectMapper.readTree(trimmed);
    }

    Optional<String> sseJson =
        trimmed
            .lines()
            .map(String::trim)
            .filter(line -> line.startsWith("data:"))
            .map(line -> line.substring("data:".length()).trim())
            .filter(data -> !data.isBlank() && !"[DONE]".equals(data))
            .reduce((first, second) -> second);

    assertThat(sseJson).as("SSE response should contain JSON data line").isPresent();
    return objectMapper.readTree(sseJson.orElseThrow());
  }

  private List<String> toolNames(JsonNode responseBody) {
    JsonNode tools = responseBody.path("result").path("tools");
    return StreamSupport.stream(tools.spliterator(), false)
        .map(node -> node.path("name").asText())
        .toList();
  }

  private String initializePayload() {
    String params =
        """
        {
          "protocolVersion":"2025-06-18",
          "clientInfo":{"name":"team-ai-test","version":"1.0.0"},
          "capabilities":{}
        }
        """;
    return jsonRpc("init-1", "initialize", params);
  }

  private String jsonRpc(String id, String method, String paramsJson) {
    return """
        {
          "jsonrpc":"2.0",
          "id":"%s",
          "method":"%s",
          "params":%s
        }
        """
        .formatted(id, method, paramsJson);
  }

  @SafeVarargs
  private static <E extends Entity<?, ?>> Many<E> manyOf(E... items) {
    return new TestMany<>(List.of(items));
  }

  private static final class TestMany<E extends Entity<?, ?>> implements Many<E> {
    private final List<E> values;

    private TestMany(List<E> values) {
      this.values = values;
    }

    @Override
    public int size() {
      return values.size();
    }

    @Override
    public Many<E> subCollection(int from, int to) {
      return new TestMany<>(values.subList(from, to));
    }

    @Override
    public Iterator<E> iterator() {
      return values.iterator();
    }
  }

  @SpringBootConfiguration
  @EnableAutoConfiguration
  @Import({McpToolConfig.class, TeamAiMcpTools.class})
  static class TestMcpApp {
    @Bean
    Projects projects() {
      return mock(Projects.class);
    }
  }
}
