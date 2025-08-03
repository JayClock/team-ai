package reengineering.ddd.config;

import jakarta.inject.Inject;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

import java.util.Collection;
import java.util.Map;

@Service
public class OAuth2UserService extends DefaultOAuth2UserService {
  private final Users users;

  @Inject
  private OAuth2UserService(Users users) {
    this.users = users;
  }

  @Override
  public OAuth2User loadUser(OAuth2UserRequest userRequest) throws OAuth2AuthenticationException {
    OAuth2User oAuth2User = super.loadUser(userRequest);
    String provider = userRequest.getClientRegistration().getRegistrationId();
    Object idAttribute = oAuth2User.getAttribute("id");
    String providerId = idAttribute != null ? idAttribute.toString() : null;
    String name = oAuth2User.getAttribute("name");
    String email = oAuth2User.getAttribute("email");
    User user = users.createUser(new UserDescription(name, email));
    user.add(new AccountDescription(provider, providerId));
    return new CustomOAuth2User(oAuth2User, user);
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
