package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import java.util.Map;
import org.junit.jupiter.api.Test;

class AcpApiTest extends ApiTest {

  @Test
  void should_initialize_acp_via_json_rpc() {
    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "initialize",
                "params", Map.of("client", "web"),
                "id", "req-1"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200)
        .body("jsonrpc", equalTo("2.0"))
        .body("id", equalTo("req-1"))
        .body("result.server.name", equalTo("team-ai-acp"))
        .body("result.capabilities.sse", equalTo(true))
        .body("error", equalTo(null));
  }

  @Test
  void should_return_method_not_found_for_unknown_rpc_method() {
    given(documentationSpec)
        .contentType("application/json")
        .body(Map.of("jsonrpc", "2.0", "method", "session/new", "params", Map.of(), "id", 100))
        .when()
        .post("/acp")
        .then()
        .statusCode(200)
        .body("jsonrpc", equalTo("2.0"))
        .body("id", equalTo(100))
        .body("result", equalTo(null))
        .body("error.code", equalTo(-32601))
        .body("error.message", containsString("Method not found"));
  }

  @Test
  void should_open_acp_sse_stream() {
    given(documentationSpec)
        .accept("text/event-stream")
        .queryParam("sessionId", "s-1")
        .when()
        .get("/acp")
        .then()
        .statusCode(200)
        .contentType(containsString("text/event-stream"))
        .body(containsString("sessionId"))
        .body(containsString("s-1"))
        .body(containsString("CONNECTED"))
        .body(notNullValue());
  }
}
