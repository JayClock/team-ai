package reengineering.ddd.teamai.role;

import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;

public class ProjectViewer implements ProjectParticipant {
  private final User user;
  private final Project project;

  public ProjectViewer(User user, Project project) {
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
