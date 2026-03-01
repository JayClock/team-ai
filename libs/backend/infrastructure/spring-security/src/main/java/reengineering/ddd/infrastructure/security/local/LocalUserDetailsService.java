package reengineering.ddd.infrastructure.security.local;

import java.util.Collections;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import reengineering.ddd.teamai.model.LocalCredential;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

@Service
public class LocalUserDetailsService implements UserDetailsService {
  private final Users users;

  public LocalUserDetailsService(Users users) {
    this.users = users;
  }

  @Override
  public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
    User user =
        users
            .findByUsername(username)
            .orElseThrow(() -> new UsernameNotFoundException("User not found"));

    LocalCredential credential =
        user.credential()
            .orElseThrow(
                () -> new UsernameNotFoundException("User has no local credentials configured"));

    return org.springframework.security.core.userdetails.User.builder()
        .username(credential.getDescription().username())
        .password(credential.getDescription().passwordHash())
        .authorities(Collections.emptyList())
        .build();
  }
}
