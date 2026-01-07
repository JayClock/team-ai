package reengineering.ddd.infrastructure.security.config;

import jakarta.inject.Inject;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
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
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;
import org.springframework.web.filter.OncePerRequestFilter;
import reengineering.ddd.infrastructure.security.oauth2.OAuth2UserService;

import java.io.IOException;
import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {
  private final OAuth2UserService oAuth2UserService;

  @Inject
  public SecurityConfig(OAuth2UserService oAuth2UserService) {
    this.oAuth2UserService = oAuth2UserService;
  }

  @Bean
  @Profile("!dev")
  public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
      .authorizeHttpRequests(authz -> authz
        .requestMatchers("/", "/public/**", "/api").permitAll()
        .anyRequest().authenticated()
      )
      .csrf(AbstractHttpConfigurer::disable)
      .oauth2Login(oauth2 -> oauth2
        .userInfoEndpoint(userInfo -> userInfo
          .userService(oAuth2UserService)
        )
        .successHandler(apiAuthenticationSuccessHandler())
      ).logout(logout -> logout
        .logoutSuccessHandler(apiLogoutSuccessHandler())
        .deleteCookies("JSESSIONID")
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
        protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response, @NonNull FilterChain filterChain) throws ServletException, IOException {
          SecurityContext context = SecurityContextHolder.createEmptyContext();
          context.setAuthentication(new UsernamePasswordAuthenticationToken("1", "N/A", List.of(new SimpleGrantedAuthority("ROLE_USER"))));
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
  public AuthenticationSuccessHandler apiAuthenticationSuccessHandler() {
    return (request, response, authentication) -> {
      response.sendRedirect("/");
    };
  }

  @Bean
  public LogoutSuccessHandler apiLogoutSuccessHandler() {
    return (request, response, authentication) -> {
      response.sendRedirect("/");
    };
  }

  @Bean
  public AuthenticationEntryPoint apiAuthenticationEntryPoint() {
    return (request, response, authException) -> {
      response.sendRedirect("/api/");
    };
  }
}
