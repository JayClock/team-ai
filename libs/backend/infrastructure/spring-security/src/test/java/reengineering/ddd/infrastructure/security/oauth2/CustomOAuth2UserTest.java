package reengineering.ddd.infrastructure.security.oauth2;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.user.OAuth2User;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.User;

@ExtendWith(MockitoExtension.class)
class CustomOAuth2UserTest {

  @Mock private OAuth2User oauth2User;

  @Mock private User user;

  @Mock private User.Accounts accounts;

  @Mock private User.Conversations conversations;

  private OAuth2UserService.CustomOAuth2User customOAuth2User;

  @BeforeEach
  void setUp() {
    customOAuth2User = new OAuth2UserService.CustomOAuth2User(oauth2User, user);
  }

  @Test
  void should_return_user_identity_as_name() {
    when(user.getIdentity()).thenReturn("user-123");

    String name = customOAuth2User.getName();

    assertThat(name).isEqualTo("user-123");
  }

  @Test
  void should_delegate_attributes_to_oauth2_user() {
    Map<String, Object> expectedAttributes =
        Map.of(
            "id", "12345",
            "login", "testuser",
            "name", "Test User",
            "email", "test@example.com");
    when(oauth2User.getAttributes()).thenReturn(expectedAttributes);

    Map<String, Object> attributes = customOAuth2User.getAttributes();

    assertThat(attributes).isEqualTo(expectedAttributes);
    assertThat(attributes.get("id")).isEqualTo("12345");
    assertThat(attributes.get("email")).isEqualTo("test@example.com");
  }

  @Test
  void should_delegate_authorities_to_oauth2_user() {
    Collection<GrantedAuthority> expectedAuthorities =
        List.of(new SimpleGrantedAuthority("ROLE_USER"), new SimpleGrantedAuthority("SCOPE_read"));
    org.mockito.Mockito.doReturn(expectedAuthorities).when(oauth2User).getAuthorities();

    Collection<? extends GrantedAuthority> authorities = customOAuth2User.getAuthorities();

    assertThat(authorities).hasSize(2);
    assertThat(authorities)
        .extracting(GrantedAuthority::getAuthority)
        .containsExactlyInAnyOrder("ROLE_USER", "SCOPE_read");
  }

  @Test
  void should_return_wrapped_user() {
    User returnedUser = customOAuth2User.getUser();

    assertThat(returnedUser).isSameAs(user);
  }

  @Test
  void should_handle_empty_attributes() {
    when(oauth2User.getAttributes()).thenReturn(Map.of());

    Map<String, Object> attributes = customOAuth2User.getAttributes();

    assertThat(attributes).isEmpty();
  }

  @Test
  void should_handle_empty_authorities() {
    org.mockito.Mockito.doReturn(List.of()).when(oauth2User).getAuthorities();

    Collection<? extends GrantedAuthority> authorities = customOAuth2User.getAuthorities();

    assertThat(authorities).isEmpty();
  }

  @Test
  void should_return_user_with_correct_description() {
    UserDescription description = new UserDescription("John Doe", "john@example.com");
    when(user.getDescription()).thenReturn(description);

    UserDescription returnedDescription = customOAuth2User.getUser().getDescription();

    assertThat(returnedDescription.name()).isEqualTo("John Doe");
    assertThat(returnedDescription.email()).isEqualTo("john@example.com");
  }
}
