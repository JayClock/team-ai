package reengineering.ddd.teamai.model;

import java.util.Optional;
import reengineering.ddd.teamai.context.ProjectContext;
import reengineering.ddd.teamai.description.LocalCredentialDescription;
import reengineering.ddd.teamai.description.UserDescription;

public interface Users {
  Optional<User> findByIdentity(String id);

  Optional<User> findByUsername(String username);

  Optional<User> findByEmail(String email);

  LocalCredential bindLocalCredential(String userId, LocalCredentialDescription description);

  User createUser(UserDescription description);

  void update(String id, UserDescription request);

  ProjectContext inProjectContext(Project project);
}
