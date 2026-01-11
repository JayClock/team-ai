package reengineering.ddd.infrastructure.security.jwt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.context.SecurityContextHolder;
import reengineering.ddd.infrastructure.security.config.SecurityConfig;

@ExtendWith(MockitoExtension.class)
class JwtAuthenticationFilterTest {

  @Mock private JwtUtil jwtUtil;

  @Mock private HttpServletRequest request;

  @Mock private HttpServletResponse response;

  @Mock private FilterChain filterChain;

  private JwtAuthenticationFilter filter;

  @BeforeEach
  void setUp() {
    filter = new JwtAuthenticationFilter(jwtUtil);
    SecurityContextHolder.clearContext();
  }

  @AfterEach
  void tearDown() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void should_authenticate_user_from_cookie_token() throws ServletException, IOException {
    String validToken = "valid-jwt-token";
    String userId = "user-123";

    Cookie authCookie = new Cookie(SecurityConfig.AUTH_TOKEN_COOKIE, validToken);
    when(request.getCookies()).thenReturn(new Cookie[] {authCookie});
    when(jwtUtil.getUserIdFromToken(validToken)).thenReturn(Optional.of(userId));

    filter.doFilterInternal(request, response, filterChain);

    verify(filterChain).doFilter(request, response);
    assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
    assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal())
        .isEqualTo(userId);
  }

  @Test
  void should_authenticate_user_from_bearer_header() throws ServletException, IOException {
    String validToken = "valid-jwt-token";
    String userId = "user-456";

    when(request.getCookies()).thenReturn(null);
    when(request.getHeader("Authorization")).thenReturn("Bearer " + validToken);
    when(jwtUtil.getUserIdFromToken(validToken)).thenReturn(Optional.of(userId));

    filter.doFilterInternal(request, response, filterChain);

    verify(filterChain).doFilter(request, response);
    assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
    assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal())
        .isEqualTo(userId);
  }

  @Test
  void should_prefer_cookie_token_over_header() throws ServletException, IOException {
    String cookieToken = "cookie-token";
    String headerToken = "header-token";
    String cookieUserId = "cookie-user";

    Cookie authCookie = new Cookie(SecurityConfig.AUTH_TOKEN_COOKIE, cookieToken);
    when(request.getCookies()).thenReturn(new Cookie[] {authCookie});
    when(jwtUtil.getUserIdFromToken(cookieToken)).thenReturn(Optional.of(cookieUserId));

    filter.doFilterInternal(request, response, filterChain);

    verify(filterChain).doFilter(request, response);
    verify(jwtUtil).getUserIdFromToken(cookieToken);
    verify(jwtUtil, never()).getUserIdFromToken(headerToken);
    assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal())
        .isEqualTo(cookieUserId);
  }

  @Test
  void should_continue_filter_chain_without_authentication_when_no_token()
      throws ServletException, IOException {
    when(request.getCookies()).thenReturn(null);
    when(request.getHeader("Authorization")).thenReturn(null);

    filter.doFilterInternal(request, response, filterChain);

    verify(filterChain).doFilter(request, response);
    assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
  }

  @Test
  void should_continue_filter_chain_without_authentication_when_token_invalid()
      throws ServletException, IOException {
    String invalidToken = "invalid-token";

    Cookie authCookie = new Cookie(SecurityConfig.AUTH_TOKEN_COOKIE, invalidToken);
    when(request.getCookies()).thenReturn(new Cookie[] {authCookie});
    when(jwtUtil.getUserIdFromToken(invalidToken)).thenReturn(Optional.empty());

    filter.doFilterInternal(request, response, filterChain);

    verify(filterChain).doFilter(request, response);
    assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
  }

  @Test
  void should_ignore_non_bearer_authorization_header() throws ServletException, IOException {
    when(request.getCookies()).thenReturn(null);
    when(request.getHeader("Authorization")).thenReturn("Basic dXNlcjpwYXNz");

    filter.doFilterInternal(request, response, filterChain);

    verify(filterChain).doFilter(request, response);
    verify(jwtUtil, never()).getUserIdFromToken(anyString());
    assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
  }

  @Test
  void should_ignore_other_cookies() throws ServletException, IOException {
    Cookie otherCookie = new Cookie("other_cookie", "some-value");
    when(request.getCookies()).thenReturn(new Cookie[] {otherCookie});
    when(request.getHeader("Authorization")).thenReturn(null);

    filter.doFilterInternal(request, response, filterChain);

    verify(filterChain).doFilter(request, response);
    verify(jwtUtil, never()).getUserIdFromToken(anyString());
    assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
  }

  @Test
  void should_set_user_role_in_authentication() throws ServletException, IOException {
    String validToken = "valid-jwt-token";
    String userId = "user-789";

    Cookie authCookie = new Cookie(SecurityConfig.AUTH_TOKEN_COOKIE, validToken);
    when(request.getCookies()).thenReturn(new Cookie[] {authCookie});
    when(jwtUtil.getUserIdFromToken(validToken)).thenReturn(Optional.of(userId));

    filter.doFilterInternal(request, response, filterChain);

    assertThat(SecurityContextHolder.getContext().getAuthentication().getAuthorities())
        .anyMatch(auth -> auth.getAuthority().equals("ROLE_USER"));
  }

  @Test
  void should_find_auth_cookie_among_multiple_cookies() throws ServletException, IOException {
    String validToken = "valid-jwt-token";
    String userId = "user-multi";

    Cookie sessionCookie = new Cookie("JSESSIONID", "session-123");
    Cookie authCookie = new Cookie(SecurityConfig.AUTH_TOKEN_COOKIE, validToken);
    Cookie trackingCookie = new Cookie("tracking", "track-123");

    when(request.getCookies()).thenReturn(new Cookie[] {sessionCookie, authCookie, trackingCookie});
    when(jwtUtil.getUserIdFromToken(validToken)).thenReturn(Optional.of(userId));

    filter.doFilterInternal(request, response, filterChain);

    verify(filterChain).doFilter(request, response);
    assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
    assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal())
        .isEqualTo(userId);
  }
}
