package reengineering.ddd.infrastructure.security.config;

import jakarta.inject.Inject;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;
import reengineering.ddd.infrastructure.security.filter.RedirectUrlCookieFilter;
import reengineering.ddd.infrastructure.security.jwt.JwtAuthenticationFilter;
import reengineering.ddd.infrastructure.security.jwt.JwtUtil;
import reengineering.ddd.infrastructure.security.oauth2.OAuth2UserService;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {
  public static final String AUTH_TOKEN_COOKIE = "auth_token";
  private static final long COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days
  private static final String DEFAULT_REDIRECT_URI = "/";

  private final OAuth2UserService oAuth2UserService;
  private final JwtUtil jwtUtil;
  private final JwtAuthenticationFilter jwtAuthenticationFilter;
  private final Environment environment;

  @Inject
  public SecurityConfig(
    OAuth2UserService oAuth2UserService,
    JwtUtil jwtUtil,
    JwtAuthenticationFilter jwtAuthenticationFilter,
    Environment environment
  ) {
    this.oAuth2UserService = oAuth2UserService;
    this.jwtUtil = jwtUtil;
    this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    this.environment = environment;
  }

  private boolean isSecureEnvironment() {
    return !Arrays.asList(environment.getActiveProfiles()).contains("dev");
  }

  @Bean
  @Profile("!dev")
  public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
      .authorizeHttpRequests(auth -> auth
        .requestMatchers("/", "/public/**", "/api", "/oauth2/**", "/login/**").permitAll()
        .anyRequest().authenticated()
      )
      .csrf(AbstractHttpConfigurer::disable)
      .sessionManagement(session -> session
        .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
      )
      .oauth2Login(oauth2 -> oauth2
        .userInfoEndpoint(userInfo -> userInfo
          .userService(oAuth2UserService)
        )
        .successHandler((request, response, authentication) -> {
          OAuth2UserService.CustomOAuth2User oauthUser =
            (OAuth2UserService.CustomOAuth2User) authentication.getPrincipal();

          String token = jwtUtil.generateToken(oauthUser.getUser());

          ResponseCookie cookie = ResponseCookie.from(AUTH_TOKEN_COOKIE, token)
            .httpOnly(true)
            .secure(isSecureEnvironment())
            .path("/")
            .maxAge(COOKIE_MAX_AGE_SECONDS)
            .sameSite("Lax")
            .build();

          response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());

          String targetUrl = DEFAULT_REDIRECT_URI;
          Cookie[] cookies = request.getCookies();
          if (cookies != null) {
            for (Cookie c : cookies) {
              if (RedirectUrlCookieFilter.RETURN_TO_COOKIE.equals(c.getName())) {
                targetUrl = c.getValue();
                c.setValue("");
                c.setPath("/");
                c.setMaxAge(0);
                response.addCookie(c);
                break;
              }
            }
          }

          response.sendRedirect(targetUrl);
        })
      )
      .addFilterBefore(new RedirectUrlCookieFilter(), OAuth2AuthorizationRequestRedirectFilter.class)
      .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
      .logout(logout -> logout
        .logoutUrl("/auth/logout")
        .logoutSuccessHandler((req, resp, auth) -> {
          ResponseCookie cookie = ResponseCookie.from(AUTH_TOKEN_COOKIE, "")
            .httpOnly(true)
            .secure(isSecureEnvironment())
            .path("/")
            .maxAge(0)
            .sameSite("Lax")
            .build();
          resp.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
          resp.setStatus(HttpServletResponse.SC_OK);
        })
      )
      .headers(headers -> headers
        .cacheControl(HeadersConfigurer.CacheControlConfig::disable)
      )
      .exceptionHandling(handling -> handling
        .authenticationEntryPoint(apiAuthenticationEntryPoint())
      );
    return http.build();
  }

  @Bean
  @Profile("dev")
  public SecurityFilterChain devSecurityFilterChain(HttpSecurity http) throws Exception {
    http
      .authorizeHttpRequests(auth -> auth
        .anyRequest().permitAll()
      )
      .addFilterBefore(new OncePerRequestFilter() {
        @Override
        protected void doFilterInternal(
          @NonNull HttpServletRequest request,
          @NonNull HttpServletResponse response,
          @NonNull FilterChain filterChain) throws ServletException, IOException {
          SecurityContext context = SecurityContextHolder.createEmptyContext();
          context.setAuthentication(new UsernamePasswordAuthenticationToken(
            "1", "N/A", List.of(new SimpleGrantedAuthority("ROLE_USER"))));
          SecurityContextHolder.setContext(context);
          filterChain.doFilter(request, response);
        }
      }, AnonymousAuthenticationFilter.class)
      .csrf(AbstractHttpConfigurer::disable)
      .headers(headers -> headers
        .cacheControl(HeadersConfigurer.CacheControlConfig::disable)
      );
    return http.build();
  }

  @Bean
  public AuthenticationEntryPoint apiAuthenticationEntryPoint() {
    return (request, response, authException) -> {
      response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
      response.setContentType("application/json");
      response.getWriter().write("{\"error\":\"Unauthorized\",\"message\":\"Authentication required\"}");
    };
  }
}
