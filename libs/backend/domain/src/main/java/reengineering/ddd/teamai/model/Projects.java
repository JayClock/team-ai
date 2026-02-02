package reengineering.ddd.teamai.model;

import java.util.Optional;

public interface Projects {
  Optional<Project> findByIdentity(String id);
}
