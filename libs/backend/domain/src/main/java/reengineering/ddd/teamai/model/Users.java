package reengineering.ddd.teamai.model;

import reengineering.ddd.teamai.description.UserDescription;

import java.util.Optional;

public interface Users {
  Optional<User> findById(String id);

  User createUser(UserDescription description);
}

