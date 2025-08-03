package reengineering.ddd.config;

import jakarta.inject.Inject;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {
  private final OAuth2UserService oAuth2UserService;

  @Inject
  public SecurityConfig(OAuth2UserService oAuth2UserService) {
    this.oAuth2UserService = oAuth2UserService;
  }

  @Bean
  public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http
      .oauth2Login(oauth2 -> oauth2
        .userInfoEndpoint(userInfo -> userInfo
          .userService(oAuth2UserService)
        )
        .successHandler((request, response, authentication) -> {
          response.sendRedirect("/");
        })
        .failureHandler((request, response, exception) -> {
          response.sendRedirect("/login?error");
        })
      )
      .authorizeHttpRequests(authz -> authz
        .requestMatchers("/api/public/**", "/login", "/error").permitAll()
        .anyRequest().authenticated()
      );
    return http.build();
  }
}

