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
import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {
  private static final String AUTH_TRANSPORT_COOKIE = "auth_transport";
  private static final int COOKIE_MAX_AGE_SECONDS = 30;
  private static final String DEFAULT_REDIRECT_URI = "/";

  private final OAuth2UserService oAuth2UserService;
  private final JwtUtil jwtUtil;
  private final JwtAuthenticationFilter jwtAuthenticationFilter;

  @Inject
  public SecurityConfig(
    OAuth2UserService oAuth2UserService,
    JwtUtil jwtUtil,
    JwtAuthenticationFilter jwtAuthenticationFilter
  ) {
    this.oAuth2UserService = oAuth2UserService;
    this.jwtUtil = jwtUtil;
    this.jwtAuthenticationFilter = jwtAuthenticationFilter;
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

          Cookie tokenCookie = new Cookie(AUTH_TRANSPORT_COOKIE, token);
          tokenCookie.setPath("/");
          tokenCookie.setMaxAge(COOKIE_MAX_AGE_SECONDS);
          tokenCookie.setHttpOnly(false);

          response.addCookie(tokenCookie);

          String targetUrl = DEFAULT_REDIRECT_URI;
          Cookie[] cookies = request.getCookies();
          if (cookies != null) {
            for (Cookie cookie : cookies) {
              if (RedirectUrlCookieFilter.REDIRECT_URI_COOKIE.equals(cookie.getName())) {
                targetUrl = cookie.getValue();
                cookie.setValue("");
                cookie.setPath("/");
                cookie.setMaxAge(0);
                response.addCookie(cookie);
                break;
              }
            }
          }

          response.sendRedirect(targetUrl);
        })
      )
      .addFilterBefore(new RedirectUrlCookieFilter(), OAuth2AuthorizationRequestRedirectFilter.class)
      .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
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
