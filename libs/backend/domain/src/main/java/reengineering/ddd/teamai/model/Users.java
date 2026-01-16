package reengineering.ddd.teamai.model;

import java.util.Optional;
import reengineering.ddd.teamai.description.UserDescription;

public interface Users {
  Optional<User> findById(String id);

  User createUser(UserDescription description);

  void update(String id, User.UserChange request);
}
