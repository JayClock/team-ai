package reengineering.ddd.infrastructure.security.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import org.springframework.lang.NonNull;
import org.springframework.web.filter.OncePerRequestFilter;

/** Normalizes inbound API key headers to the canonical X-Api-Key header. */
public class ApiKeyHeaderNormalizationFilter extends OncePerRequestFilter {
  public static final String API_KEY_HEADER = "X-Api-Key";
  public static final String API_KEY_HEADER_ALIAS = "apiKey";

  @Override
  protected void doFilterInternal(
      @NonNull HttpServletRequest request,
      @NonNull HttpServletResponse response,
      @NonNull FilterChain filterChain)
      throws ServletException, IOException {
    String apiKey = resolveApiKey(request);
    if (apiKey == null) {
      filterChain.doFilter(request, response);
      return;
    }

    HttpServletRequest wrappedRequest = new ApiKeyNormalizedRequest(request, apiKey);
    filterChain.doFilter(wrappedRequest, response);
  }

  private String resolveApiKey(HttpServletRequest request) {
    String canonical = request.getHeader(API_KEY_HEADER);
    if (canonical != null && !canonical.trim().isEmpty()) {
      return canonical.trim();
    }

    String alias = request.getHeader(API_KEY_HEADER_ALIAS);
    if (alias != null && !alias.trim().isEmpty()) {
      return alias.trim();
    }

    return null;
  }

  private static class ApiKeyNormalizedRequest extends HttpServletRequestWrapper {
    private final String apiKey;

    ApiKeyNormalizedRequest(HttpServletRequest request, String apiKey) {
      super(request);
      this.apiKey = apiKey;
    }

    @Override
    public String getHeader(String name) {
      if (API_KEY_HEADER.equalsIgnoreCase(name)) {
        return apiKey;
      }
      return super.getHeader(name);
    }

    @Override
    public Enumeration<String> getHeaders(String name) {
      if (API_KEY_HEADER.equalsIgnoreCase(name)) {
        return Collections.enumeration(List.of(apiKey));
      }
      return super.getHeaders(name);
    }

    @Override
    public Enumeration<String> getHeaderNames() {
      Enumeration<String> headerNames = super.getHeaderNames();
      List<String> names =
          headerNames == null ? new ArrayList<>() : new ArrayList<>(Collections.list(headerNames));
      if (names.stream().noneMatch(API_KEY_HEADER::equalsIgnoreCase)) {
        names.add(API_KEY_HEADER);
      }
      return Collections.enumeration(names);
    }
  }
}
