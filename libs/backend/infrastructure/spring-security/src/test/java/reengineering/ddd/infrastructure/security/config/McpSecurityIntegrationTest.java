package reengineering.ddd.infrastructure.security.config;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.infrastructure.security.filter.McpProjectAuthorizationFilter;
import reengineering.ddd.infrastructure.security.jwt.JwtAuthenticationFilter;
import reengineering.ddd.infrastructure.security.jwt.JwtUtil;
import reengineering.ddd.infrastructure.security.local.LocalUserDetailsService;
import reengineering.ddd.infrastructure.security.oauth2.OAuth2UserService;
import reengineering.ddd.teamai.description.MemberDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Member;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Projects;
import reengineering.ddd.teamai.model.User;

@SpringBootTest(classes = McpSecurityIntegrationTest.TestApp.class)
@AutoConfigureMockMvc
class McpSecurityIntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private Projects projects;
  @Autowired private JwtUtil jwtUtil;

  @BeforeEach
  void setUp() {
    reset(projects);
    Project project = mock(Project.class);
    Project.Members members = mock(Project.Members.class);
    Member member =
        new Member("u1", new MemberDescription(new Ref<>("u1"), Project.Role.OWNER.name()));

    when(project.getIdentity()).thenReturn("p1");
    when(project.getDescription()).thenReturn(new ProjectDescription("Alpha"));
    when(project.members()).thenReturn(members);
    when(members.findByIdentity("u1")).thenReturn(Optional.of(member));
    when(members.findByIdentity("u2")).thenReturn(Optional.empty());
    when(projects.findByIdentity("p1")).thenReturn(Optional.of(project));
  }

  @Test
  void should_return_401_for_unauthenticated_mcp_request() throws Exception {
    mockMvc
        .perform(post("/mcp").contentType(APPLICATION_JSON).content(toolsCallPayload("p1")))
        .andExpect(status().isUnauthorized())
        .andExpect(content().string(containsString("Unauthorized")));
  }

  @Test
  void should_return_403_for_non_member_project_access() throws Exception {
    mockMvc
        .perform(
            post("/mcp")
                .header("Authorization", "Bearer " + tokenFor("u2"))
                .contentType(APPLICATION_JSON)
                .content(toolsCallPayload("p1")))
        .andExpect(status().isForbidden())
        .andExpect(content().string(containsString("Forbidden")));
  }

  @Test
  void should_allow_member_project_access() throws Exception {
    mockMvc
        .perform(
            post("/mcp")
                .header("Authorization", "Bearer " + tokenFor("u1"))
                .contentType(APPLICATION_JSON)
                .content(toolsCallPayload("p1")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(true));
  }

  private String tokenFor(String userId) {
    User user =
        new User(
            userId,
            new UserDescription("User " + userId, userId + "@example.com"),
            null,
            null,
            null);
    return jwtUtil.generateToken(user);
  }

  private String toolsCallPayload(String projectId) {
    return """
        {
          "jsonrpc":"2.0",
          "id":"call-1",
          "method":"tools/call",
          "params":{
            "name":"list_tasks",
            "arguments":{"projectId":"%s"}
          }
        }
        """
        .formatted(projectId);
  }

  @SpringBootConfiguration
  @EnableAutoConfiguration
  @Import({SecurityConfig.class, McpProjectAuthorizationFilter.class})
  static class TestApp {
    @Bean
    Projects projects() {
      return mock(Projects.class);
    }

    @Bean
    OAuth2UserService oAuth2UserService() {
      return mock(OAuth2UserService.class);
    }

    @Bean
    ClientRegistrationRepository clientRegistrationRepository() {
      ClientRegistration registration =
          ClientRegistration.withRegistrationId("test")
              .clientId("test-client")
              .clientSecret("test-secret")
              .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
              .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
              .scope("openid", "profile")
              .authorizationUri("https://example.com/oauth2/authorize")
              .tokenUri("https://example.com/oauth2/token")
              .userInfoUri("https://example.com/userinfo")
              .userNameAttributeName("sub")
              .clientName("test-client")
              .build();
      return new InMemoryClientRegistrationRepository(registration);
    }

    @Bean
    LocalUserDetailsService localUserDetailsService() {
      return mock(LocalUserDetailsService.class);
    }

    @Bean
    JwtUtil jwtUtil() {
      return new JwtUtil("test-secret-key-for-mcp-security-1234567890", 3_600_000L);
    }

    @Bean
    JwtAuthenticationFilter jwtAuthenticationFilter(JwtUtil jwtUtil) {
      return new JwtAuthenticationFilter(jwtUtil);
    }

    @Bean
    McpStubController mcpStubController() {
      return new McpStubController();
    }
  }

  @RestController
  static class McpStubController {
    @PostMapping("/mcp")
    Map<String, Object> mcp(@RequestBody Map<String, Object> payload) {
      return Map.of("ok", true);
    }
  }
}
