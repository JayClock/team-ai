package reengineering.ddd.teamai.role;

import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Projects;
import reengineering.ddd.teamai.model.User;

public class ProjectOwner implements ProjectParticipant {
  private final User user;
  private final Project project;
  private final Projects projects;

  public ProjectOwner(User user, Project project, Projects projects) {
    this.user = user;
    this.project = project;
    this.projects = projects;
  }

  public User getUser() {
    return user;
  }

  public Project getProject() {
    return project;
  }

  public void delete() {
    projects.delete(project.getIdentity());
  }
}
