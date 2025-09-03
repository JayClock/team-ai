package reengineering.ddd.teamai.model;

import java.util.List;
import java.util.Optional;


public interface Contexts {
  List<Context> findAll();

  Optional<Context> findById(String id);
}
