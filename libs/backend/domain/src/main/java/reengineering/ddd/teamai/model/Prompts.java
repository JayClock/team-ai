package reengineering.ddd.teamai.model;

import java.util.List;
import java.util.Optional;

public interface Prompts {
  List<Prompt> findAll();

  Optional<Prompt> findById(String id);
}
