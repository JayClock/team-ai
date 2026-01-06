package reengineering.ddd.infrastructure.security.config;

import jakarta.inject.Inject;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
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
