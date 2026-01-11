package reengineering.ddd.infrastructure.security.filter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RedirectUrlCookieFilterTest {

  @Mock private HttpServletRequest request;

  @Mock private HttpServletResponse response;

  @Mock private FilterChain filterChain;

  @Captor private ArgumentCaptor<Cookie> cookieCaptor;

  private RedirectUrlCookieFilter filter;

  @BeforeEach
  void setUp() {
    filter = new RedirectUrlCookieFilter();
  }

  @Test
  void should_add_return_to_cookie_when_parameter_present() throws ServletException, IOException {
    String returnToUrl = "/dashboard";
    when(request.getParameter(RedirectUrlCookieFilter.RETURN_TO_PARAM)).thenReturn(returnToUrl);

    filter.doFilterInternal(request, response, filterChain);

    verify(response).addCookie(cookieCaptor.capture());
    Cookie cookie = cookieCaptor.getValue();

    assertThat(cookie.getName()).isEqualTo(RedirectUrlCookieFilter.RETURN_TO_COOKIE);
    assertThat(cookie.getValue()).isEqualTo(returnToUrl);
    assertThat(cookie.getPath()).isEqualTo("/");
    assertThat(cookie.getMaxAge()).isEqualTo(180);
    assertThat(cookie.isHttpOnly()).isTrue();

    verify(filterChain).doFilter(request, response);
  }

  @Test
  void should_not_add_cookie_when_return_to_parameter_absent()
      throws ServletException, IOException {
    when(request.getParameter(RedirectUrlCookieFilter.RETURN_TO_PARAM)).thenReturn(null);

    filter.doFilterInternal(request, response, filterChain);

    verify(response, never()).addCookie(any(Cookie.class));
    verify(filterChain).doFilter(request, response);
  }

  @Test
  void should_not_add_cookie_when_return_to_parameter_empty() throws ServletException, IOException {
    when(request.getParameter(RedirectUrlCookieFilter.RETURN_TO_PARAM)).thenReturn("");

    filter.doFilterInternal(request, response, filterChain);

    verify(response, never()).addCookie(any(Cookie.class));
    verify(filterChain).doFilter(request, response);
  }

  @Test
  void should_not_add_cookie_when_return_to_parameter_blank() throws ServletException, IOException {
    when(request.getParameter(RedirectUrlCookieFilter.RETURN_TO_PARAM)).thenReturn("   ");

    filter.doFilterInternal(request, response, filterChain);

    verify(response, never()).addCookie(any(Cookie.class));
    verify(filterChain).doFilter(request, response);
  }

  @Test
  void should_handle_url_with_query_parameters() throws ServletException, IOException {
    String returnToUrl = "/search?q=test&page=1";
    when(request.getParameter(RedirectUrlCookieFilter.RETURN_TO_PARAM)).thenReturn(returnToUrl);

    filter.doFilterInternal(request, response, filterChain);

    verify(response).addCookie(cookieCaptor.capture());
    Cookie cookie = cookieCaptor.getValue();

    assertThat(cookie.getValue()).isEqualTo(returnToUrl);
    verify(filterChain).doFilter(request, response);
  }

  @Test
  void should_handle_absolute_url() throws ServletException, IOException {
    String returnToUrl = "https://example.com/callback";
    when(request.getParameter(RedirectUrlCookieFilter.RETURN_TO_PARAM)).thenReturn(returnToUrl);

    filter.doFilterInternal(request, response, filterChain);

    verify(response).addCookie(cookieCaptor.capture());
    Cookie cookie = cookieCaptor.getValue();

    assertThat(cookie.getValue()).isEqualTo(returnToUrl);
    verify(filterChain).doFilter(request, response);
  }

  @Test
  void should_continue_filter_chain_regardless_of_parameter() throws ServletException, IOException {
    when(request.getParameter(RedirectUrlCookieFilter.RETURN_TO_PARAM)).thenReturn("/page");

    filter.doFilterInternal(request, response, filterChain);

    verify(filterChain).doFilter(request, response);
  }

  @Test
  void should_have_correct_constant_values() {
    assertThat(RedirectUrlCookieFilter.RETURN_TO_PARAM).isEqualTo("return_to");
    assertThat(RedirectUrlCookieFilter.RETURN_TO_COOKIE).isEqualTo("return_to_cache");
  }
}
