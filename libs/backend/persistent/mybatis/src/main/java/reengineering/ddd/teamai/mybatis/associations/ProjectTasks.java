package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.description.TaskReportDescription;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Task;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.ProjectTasksMapper;

@AssociationMapping(entity = Project.class, field = "tasks", parentIdField = "projectId")
public class ProjectTasks extends EntityList<String, Task> implements Project.Tasks {

  private static final String CACHE_NAME = "projectTasks";
  private static final String CACHE_LIST = "projectTasksList";
  private static final String CACHE_COUNT = "projectTasksCount";

  private int projectId;

  @Inject private ProjectTasksMapper mapper;

  @Override
  @Cacheable(value = CACHE_LIST, key = "#root.target.projectId + ':' + #from + ':' + #to")
  protected List<Task> findEntities(int from, int to) {
    return mapper.findTasksByProjectId(projectId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_NAME,
      key = "#root.target.projectId + ':' + #id",
      unless = "#result == null")
  protected Task findEntity(String id) {
    return mapper.findTaskByProjectAndId(projectId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_COUNT, key = "#root.target.projectId")
  public int size() {
    return mapper.countTasksByProject(projectId);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.projectId")
      })
  public Task create(TaskDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertTask(idHolder, projectId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_NAME, allEntries = true)
      })
  public void assign(String taskId, Ref<String> agent, Ref<String> callerAgent) {
    mapper.updateTaskAssignment(projectId, Integer.parseInt(taskId), agent, callerAgent);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_NAME, allEntries = true)
      })
  public void updateStatus(String taskId, TaskDescription.Status status, String completionSummary) {
    mapper.updateTaskStatus(projectId, Integer.parseInt(taskId), status, completionSummary);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_NAME, allEntries = true)
      })
  public void report(String taskId, Ref<String> agent, TaskReportDescription report) {
    mapper.updateTaskReport(projectId, Integer.parseInt(taskId), agent, report);
  }
}
