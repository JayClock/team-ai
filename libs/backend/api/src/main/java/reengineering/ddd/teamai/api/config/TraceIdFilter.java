package reengineering.ddd.teamai.api.config;

import jakarta.annotation.Priority;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.ext.Provider;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;

@Provider
@Component
@Priority(Priorities.AUTHENTICATION)
public class TraceIdFilter implements ContainerRequestFilter, ContainerResponseFilter {
  public static final String TRACE_ID_HEADER = "X-Trace-Id";
  public static final String TRACE_ID_KEY = "traceId";
  private static final String TRACE_ID_PROPERTY = "teamai.traceId";

  @Override
  public void filter(ContainerRequestContext requestContext) throws IOException {
    String traceId = resolveTraceId(requestContext.getHeaderString(TRACE_ID_HEADER));
    requestContext.setProperty(TRACE_ID_PROPERTY, traceId);
    MDC.put(TRACE_ID_KEY, traceId);
  }

  @Override
  public void filter(
      ContainerRequestContext requestContext, ContainerResponseContext responseContext)
      throws IOException {
    Object trace = requestContext.getProperty(TRACE_ID_PROPERTY);
    if (trace instanceof String traceId) {
      responseContext.getHeaders().putSingle(TRACE_ID_HEADER, traceId);
    }
    MDC.remove(TRACE_ID_KEY);
  }

  private String resolveTraceId(String traceIdHeader) {
    if (traceIdHeader != null && !traceIdHeader.isBlank()) {
      return traceIdHeader.trim();
    }
    return UUID.randomUUID().toString();
  }
}
