package reengineering.ddd.teamai.context;

import java.util.Optional;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.role.ProjectParticipant;

public interface ProjectContext {
  Optional<ProjectParticipant> asParticipant(User user, Project project);
}
