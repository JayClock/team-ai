package reengineering.ddd.teamai.model;

import java.util.Optional;
import reengineering.ddd.teamai.context.ProjectContext;
import reengineering.ddd.teamai.description.UserDescription;

public interface Users {
  Optional<User> findByIdentity(String id);

  User createUser(UserDescription description);

  void update(String id, UserDescription request);

  ProjectContext inProjectContext(Project project);
}
