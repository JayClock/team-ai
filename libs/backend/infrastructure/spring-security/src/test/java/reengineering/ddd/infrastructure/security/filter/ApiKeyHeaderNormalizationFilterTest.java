package reengineering.ddd.infrastructure.security.filter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ApiKeyHeaderNormalizationFilterTest {

  @Mock private HttpServletRequest request;
  @Mock private HttpServletResponse response;
  @Mock private FilterChain filterChain;

  @Captor private ArgumentCaptor<HttpServletRequest> requestCaptor;

  private ApiKeyHeaderNormalizationFilter filter;

  @BeforeEach
  void setUp() {
    filter = new ApiKeyHeaderNormalizationFilter();
  }

  @Test
  void should_normalize_canonical_api_key_header() throws ServletException, IOException {
    when(request.getHeader(ApiKeyHeaderNormalizationFilter.API_KEY_HEADER))
        .thenReturn("  test-api-key  ");
    when(request.getHeaderNames()).thenReturn(Collections.emptyEnumeration());

    filter.doFilterInternal(request, response, filterChain);

    verify(filterChain).doFilter(requestCaptor.capture(), eq(response));
    HttpServletRequest wrappedRequest = requestCaptor.getValue();

    assertThat(wrappedRequest.getHeader(ApiKeyHeaderNormalizationFilter.API_KEY_HEADER))
        .isEqualTo("test-api-key");
    assertThat(
            Collections.list(
                wrappedRequest.getHeaders(ApiKeyHeaderNormalizationFilter.API_KEY_HEADER)))
        .containsExactly("test-api-key");
    assertThat(Collections.list(wrappedRequest.getHeaderNames()))
        .contains(ApiKeyHeaderNormalizationFilter.API_KEY_HEADER);
  }

  @Test
  void should_use_alias_header_when_canonical_header_is_missing()
      throws ServletException, IOException {
    when(request.getHeader(ApiKeyHeaderNormalizationFilter.API_KEY_HEADER)).thenReturn(null);
    when(request.getHeader(ApiKeyHeaderNormalizationFilter.API_KEY_HEADER_ALIAS))
        .thenReturn("  alias-key  ");

    filter.doFilterInternal(request, response, filterChain);

    verify(filterChain).doFilter(requestCaptor.capture(), eq(response));
    HttpServletRequest wrappedRequest = requestCaptor.getValue();
    assertThat(wrappedRequest.getHeader(ApiKeyHeaderNormalizationFilter.API_KEY_HEADER))
        .isEqualTo("alias-key");
  }

  @Test
  void should_pass_through_request_when_api_key_is_missing() throws ServletException, IOException {
    when(request.getHeader(ApiKeyHeaderNormalizationFilter.API_KEY_HEADER)).thenReturn(null);
    when(request.getHeader(ApiKeyHeaderNormalizationFilter.API_KEY_HEADER_ALIAS)).thenReturn(null);

    filter.doFilterInternal(request, response, filterChain);

    verify(filterChain).doFilter(request, response);
  }
}
