package reengineering.ddd.config;

import jakarta.inject.Inject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

import java.util.Collection;
import java.util.List;
import java.util.Map;

@Service
public class OAuth2UserService extends DefaultOAuth2UserService {
  private static final Logger logger = LoggerFactory.getLogger(OAuth2UserService.class);
  private final Users users;
  private final RestTemplate restTemplate;

  @Inject
  public OAuth2UserService(Users users) {
    this.users = users;
    this.restTemplate = new RestTemplate();
  }

  @Override
  public OAuth2User loadUser(OAuth2UserRequest userRequest) throws OAuth2AuthenticationException {
    OAuth2User oAuth2User = super.loadUser(userRequest);
    String provider = userRequest.getClientRegistration().getRegistrationId();

    Object idAttribute = oAuth2User.getAttribute("id");
    String providerId = idAttribute != null ? idAttribute.toString() : null;
    String name = oAuth2User.getAttribute("name");
    String email = oAuth2User.getAttribute("email");

    if (email == null && "github".equals(provider)) {
      email = fetchGitHubEmail(userRequest);
    }

    User user = users.createUser(new UserDescription(name, email));
    user.add(new AccountDescription(provider, providerId));
    return new CustomOAuth2User(oAuth2User, user);
  }

  private String fetchGitHubEmail(OAuth2UserRequest userRequest) {
    try {
      String accessToken = userRequest.getAccessToken().getTokenValue();
      HttpHeaders headers = new HttpHeaders();
      headers.setBearerAuth(accessToken);
      HttpEntity<String> entity = new HttpEntity<>(headers);

      ResponseEntity<List> response = restTemplate.exchange(
        "https://api.github.com/user/emails",
        HttpMethod.GET,
        entity,
        List.class
      );

      List<Map<String, Object>> emails = response.getBody();
      if (emails != null && !emails.isEmpty()) {
        for (Map<String, Object> emailData : emails) {
          Boolean primary = (Boolean) emailData.get("primary");
          Boolean verified = (Boolean) emailData.get("verified");
          if (Boolean.TRUE.equals(primary) && Boolean.TRUE.equals(verified)) {
            return (String) emailData.get("email");
          }
        }

        for (Map<String, Object> emailData : emails) {
          Boolean verified = (Boolean) emailData.get("verified");
          if (Boolean.TRUE.equals(verified)) {
            return (String) emailData.get("email");
          }
        }

        Map<String, Object> firstEmail = emails.get(0);
        return (String) firstEmail.get("email");
      }
    } catch (Exception e) {
      logger.error("Failed to fetch GitHub email", e);
    }
    return null;
  }

  public static class CustomOAuth2User implements OAuth2User {
    private final OAuth2User oauth2User;
    private final User user;

    public CustomOAuth2User(OAuth2User oauth2User, User user) {
      this.oauth2User = oauth2User;
      this.user = user;
    }

    @Override
    public Map<String, Object> getAttributes() {
      return oauth2User.getAttributes();
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
      return oauth2User.getAuthorities();
    }

    @Override
    public String getName() {
      return user.getDescription().name();
    }
  }
}
