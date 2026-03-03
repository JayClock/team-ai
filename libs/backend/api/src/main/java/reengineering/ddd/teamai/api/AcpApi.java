package reengineering.ddd.teamai.api;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.sse.OutboundSseEvent;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
@Produces(MediaType.APPLICATION_JSON)
public class AcpApi {
  private static final String JSON_RPC_VERSION = "2.0";

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public JsonRpcResponse rpc(JsonRpcRequest request) {
    if (request == null || request.method() == null || request.method().isBlank()) {
      return JsonRpcResponse.error(
          request == null ? null : request.id(), -32600, "Invalid Request");
    }
    if ("initialize".equals(request.method().trim())) {
      return JsonRpcResponse.result(
          request.id(),
          Map.of(
              "server",
              Map.of("name", "team-ai-acp", "version", "mvp"),
              "capabilities",
              Map.of("session", true, "sse", true)));
    }
    return JsonRpcResponse.error(
        request.id(), -32601, "Method not found: " + request.method().trim());
  }

  @GET
  @Produces(MediaType.SERVER_SENT_EVENTS)
  public void stream(
      @QueryParam("sessionId") String sessionId, @Context SseEventSink sink, @Context Sse sse) {
    if (sink == null) {
      return;
    }
    String resolvedSessionId =
        sessionId == null || sessionId.isBlank() ? "unknown" : sessionId.trim();
    OutboundSseEvent event =
        sse.newEventBuilder()
            .name("status")
            .id("acp-" + UUID.randomUUID())
            .mediaType(MediaType.APPLICATION_JSON_TYPE)
            .data(
                String.class,
                "{\"sessionId\":\""
                    + escaped(resolvedSessionId)
                    + "\",\"state\":\"CONNECTED\",\"emittedAt\":\""
                    + Instant.now()
                    + "\"}")
            .build();
    sink.send(event);
    sink.close();
  }

  private static String escaped(String value) {
    return value.replace("\\", "\\\\").replace("\"", "\\\"");
  }

  public record JsonRpcRequest(
      String jsonrpc, String method, Map<String, Object> params, Object id) {}

  public record JsonRpcError(int code, String message) {}

  public record JsonRpcResponse(String jsonrpc, Object id, Object result, JsonRpcError error) {
    static JsonRpcResponse result(Object id, Object result) {
      return new JsonRpcResponse(JSON_RPC_VERSION, id, result, null);
    }

    static JsonRpcResponse error(Object id, int code, String message) {
      return new JsonRpcResponse(JSON_RPC_VERSION, id, null, new JsonRpcError(code, message));
    }
  }
}
