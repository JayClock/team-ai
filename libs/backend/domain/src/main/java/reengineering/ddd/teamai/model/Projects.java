package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.HasMany;

public interface Projects extends HasMany<String, Project> {
  void delete(String id);
}
