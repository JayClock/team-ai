package reengineering.ddd.teamai.model;

import java.util.Optional;

public interface Users {
  Optional<User> findById(String id);
}

