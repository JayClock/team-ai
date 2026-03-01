package reengineering.ddd.infrastructure.security.local;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import reengineering.ddd.archtype.HasOne;
import reengineering.ddd.teamai.description.LocalCredentialDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.LocalCredential;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

@ExtendWith(MockitoExtension.class)
class LocalUserDetailsServiceTest {

  @Mock private Users users;

  @Mock private User.Accounts accounts;

  @Mock private HasOne<LocalCredential> credential;

  @Mock private User.Projects projects;

  private LocalUserDetailsService service;

  @BeforeEach
  void setUp() {
    service = new LocalUserDetailsService(users);
  }

  @Test
  void should_load_user_details_when_local_credential_exists() {
    LocalCredential localCredential =
        new LocalCredential("1", new LocalCredentialDescription("john", "hashed-password"));
    User user =
        new User(
            "1",
            new UserDescription("John Doe", "john@example.com"),
            accounts,
            credential,
            projects);
    when(users.findByUsername("john")).thenReturn(Optional.of(user));
    when(credential.get()).thenReturn(localCredential);

    org.springframework.security.core.userdetails.UserDetails userDetails =
        service.loadUserByUsername("john");

    assertThat(userDetails.getUsername()).isEqualTo("john");
    assertThat(userDetails.getPassword()).isEqualTo("hashed-password");
  }

  @Test
  void should_throw_when_user_does_not_exist() {
    when(users.findByUsername("missing")).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.loadUserByUsername("missing"))
        .isInstanceOf(UsernameNotFoundException.class);
  }

  @Test
  void should_throw_when_user_has_no_local_credential() {
    HasOne<LocalCredential> emptyCredential = mock(HasOne.class);
    User user =
        new User(
            "2",
            new UserDescription("Jane", "jane@example.com"),
            accounts,
            emptyCredential,
            projects);
    when(users.findByUsername("jane")).thenReturn(Optional.of(user));
    when(emptyCredential.get()).thenReturn(null);

    assertThatThrownBy(() -> service.loadUserByUsername("jane"))
        .isInstanceOf(UsernameNotFoundException.class);
  }
}
