package teamai.ddd.model;

import java.util.Optional;

public interface Users {
  Optional<User> findById(String id);
}

