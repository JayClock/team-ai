package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.TaskDescription;

public class Task implements Entity<String, TaskDescription> {
  private String identity;
  private TaskDescription description;

  public Task(String identity, TaskDescription description) {
    this.identity = identity;
    this.description = description;
  }

  public Task() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public TaskDescription getDescription() {
    return description;
  }
}
