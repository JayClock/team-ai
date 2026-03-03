package reengineering.ddd.infrastructure.security.filter;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.inject.Inject;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import org.springframework.http.HttpMethod;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Projects;

@Component
public class McpProjectAuthorizationFilter extends OncePerRequestFilter {
  private static final String MCP_PATH_PREFIX = "/mcp";

  private final Projects projects;
  private final ObjectMapper objectMapper;

  @Inject
  public McpProjectAuthorizationFilter(Projects projects, ObjectMapper objectMapper) {
    this.projects = projects;
    this.objectMapper = objectMapper;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    String path = request.getRequestURI();
    if (path == null || path.isBlank()) {
      path = request.getServletPath();
    }
    return !HttpMethod.POST.matches(request.getMethod())
        || path == null
        || !path.startsWith(MCP_PATH_PREFIX);
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    CachedBodyHttpServletRequest wrappedRequest = new CachedBodyHttpServletRequest(request);
    Optional<String> projectId = extractProjectId(wrappedRequest.getCachedBody());
    if (projectId.isPresent() && !authorizeProjectAccess(projectId.get(), response)) {
      return;
    }
    filterChain.doFilter(wrappedRequest, response);
  }

  private Optional<String> extractProjectId(byte[] body) {
    if (body.length == 0) {
      return Optional.empty();
    }
    try {
      JsonNode root = objectMapper.readTree(body);
      if (!"tools/call".equals(root.path("method").asText())) {
        return Optional.empty();
      }
      JsonNode projectId = root.path("params").path("arguments").path("projectId");
      if (!projectId.isTextual()) {
        return Optional.empty();
      }
      String normalized = projectId.asText().trim();
      return normalized.isEmpty() ? Optional.empty() : Optional.of(normalized);
    } catch (IOException ignored) {
      return Optional.empty();
    }
  }

  private boolean authorizeProjectAccess(String projectId, HttpServletResponse response)
      throws IOException {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null || !authentication.isAuthenticated()) {
      return true;
    }

    String userId = authentication.getName();
    if (userId == null || userId.isBlank()) {
      return true;
    }

    Optional<Project> project = projects.findByIdentity(projectId);
    if (project.isEmpty()) {
      return true;
    }

    if (project.get().members().findByIdentity(userId).isEmpty()) {
      response.setStatus(HttpServletResponse.SC_FORBIDDEN);
      response.setContentType("application/json");
      response
          .getWriter()
          .write(
              "{\"error\":\"Forbidden\",\"message\":\"User %s is not a member of project %s\"}"
                  .formatted(userId, projectId));
      return false;
    }
    return true;
  }

  private static final class CachedBodyHttpServletRequest extends HttpServletRequestWrapper {
    private final byte[] cachedBody;

    private CachedBodyHttpServletRequest(HttpServletRequest request) throws IOException {
      super(request);
      this.cachedBody = request.getInputStream().readAllBytes();
    }

    private byte[] getCachedBody() {
      return cachedBody;
    }

    @Override
    public ServletInputStream getInputStream() {
      return new CachedBodyServletInputStream(cachedBody);
    }

    @Override
    public BufferedReader getReader() {
      return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
    }
  }

  private static final class CachedBodyServletInputStream extends ServletInputStream {
    private final ByteArrayInputStream inputStream;

    private CachedBodyServletInputStream(byte[] body) {
      this.inputStream = new ByteArrayInputStream(body);
    }

    @Override
    public boolean isFinished() {
      return inputStream.available() == 0;
    }

    @Override
    public boolean isReady() {
      return true;
    }

    @Override
    public void setReadListener(ReadListener readListener) {
      // no-op for synchronous request processing
    }

    @Override
    public int read() {
      return inputStream.read();
    }
  }
}
