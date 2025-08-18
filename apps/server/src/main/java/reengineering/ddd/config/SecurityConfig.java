package reengineering.ddd.config;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.inject.Inject;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;

@Configuration
@EnableWebSecurity
public class SecurityConfig {
  private final OAuth2UserService oAuth2UserService;
  private final ObjectMapper objectMapper;

  @Inject
  public SecurityConfig(OAuth2UserService oAuth2UserService, ObjectMapper objectMapper) {
    this.oAuth2UserService = oAuth2UserService;
    this.objectMapper = objectMapper;
  }

  @Bean
  @Profile("!dev")
  public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
      .authorizeHttpRequests(authz -> authz
        .requestMatchers("/", "/public/**").permitAll()
        .anyRequest().authenticated()
      )
      .csrf(AbstractHttpConfigurer::disable)
      .oauth2Login(oauth2 -> oauth2
        .userInfoEndpoint(userInfo -> userInfo
          .userService(oAuth2UserService)
        )
        .successHandler(apiAuthenticationSuccessHandler())
        .failureHandler(apiAuthenticationFailureHandler())
      ).logout(logout -> logout
        .logoutSuccessHandler(apiLogoutSuccessHandler())
        .deleteCookies("JSESSIONID")
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
      .authorizeHttpRequests(authz -> authz
        .anyRequest().permitAll()
      )
      .csrf(AbstractHttpConfigurer::disable);
    return http.build();
  }

  @Bean
  public AuthenticationSuccessHandler apiAuthenticationSuccessHandler() {
    return (request, response, authentication) -> {
      response.setContentType(MediaType.APPLICATION_JSON_VALUE);

      String userId = null;
      if (authentication.getPrincipal() instanceof OAuth2UserService.CustomOAuth2User customUser) {
        userId = customUser.getUser().getIdentity();
      }

      objectMapper.writeValue(response.getWriter(), AuthenticationModel.authenticated(userId));
    };
  }

  @Bean
  public LogoutSuccessHandler apiLogoutSuccessHandler() {
    return (request, response, authentication) -> {
      response.setContentType(MediaType.APPLICATION_JSON_VALUE);
      objectMapper.writeValue(response.getWriter(), AuthenticationModel.loggedOut());
    };
  }

  @Bean
  public AuthenticationEntryPoint apiAuthenticationEntryPoint() {
    return (request, response, authException) -> {
      response.setStatus(HttpStatus.UNAUTHORIZED.value());
      response.setContentType(MediaType.APPLICATION_JSON_VALUE);
      objectMapper.writeValue(response.getWriter(), AuthenticationModel.unauthorized());
    };
  }

  @Bean
  public AuthenticationFailureHandler apiAuthenticationFailureHandler() {
    return (request, response, exception) -> {
      response.setStatus(HttpStatus.UNAUTHORIZED.value());
      response.setContentType(MediaType.APPLICATION_JSON_VALUE);

      String errorMessage = "Authentication failed";
      if (exception instanceof OAuth2AuthenticationException oauth2Exception) {
        errorMessage = "OAuth2 authentication failed: " + oauth2Exception.getError().getDescription();
      }

      objectMapper.writeValue(response.getWriter(),
        AuthenticationModel.authenticationFailed(errorMessage));
    };
  }

  static class AuthenticationModel extends RepresentationModel<AuthenticationModel> {
    @JsonProperty
    private final String status;
    @JsonProperty
    private final String message;

    public AuthenticationModel(String status, String message) {
      this.status = status;
      this.message = message;
    }

    public static AuthenticationModel authenticated(String userId) {
      return new AuthenticationModel("authenticated", null)
        .add(linkTo("/api/users/" + userId).withSelfRel())
        .add(linkTo("/api/logout").withRel("logout"));
    }

    public static AuthenticationModel loggedOut() {
      return new AuthenticationModel("logged_out", null)
        .add(linkTo("/oauth2/authorization/github").withRel("github_login"));
    }

    public static AuthenticationModel unauthorized() {
      return new AuthenticationModel("unauthorized", "Authentication required")
        .add(linkTo("/oauth2/authorization/github").withRel("github_login"));
    }

    public static AuthenticationModel authenticationFailed(String errorMessage) {
      return new AuthenticationModel("authentication_failed", errorMessage)
        .add(linkTo("/oauth2/authorization/github").withRel("retry_login"));
    }

    private static org.springframework.hateoas.Link linkTo(String href) {
      return org.springframework.hateoas.Link.of(href);
    }
  }
}

