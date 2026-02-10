package reengineering.ddd.teamai.role;

import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;

public class ProjectEditor implements ProjectParticipant {
  private final User user;
  private final Project project;

  public ProjectEditor(User user, Project project) {
    this.user = user;
    this.project = project;
  }

  public User getUser() {
    return user;
  }

  public Project getProject() {
    return project;
  }
}
