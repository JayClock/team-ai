package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.description.TaskReportDescription;
import reengineering.ddd.teamai.model.Task;

@Mapper
public interface ProjectTasksMapper {
  Task findTaskByProjectAndId(@Param("project_id") int projectId, @Param("id") int id);

  List<Task> findTasksByProjectId(
      @Param("project_id") int projectId, @Param("from") int from, @Param("size") int size);

  int insertTask(
      @Param("holder") IdHolder holder,
      @Param("project_id") int projectId,
      @Param("description") TaskDescription description);

  int updateTaskAssignment(
      @Param("project_id") int projectId,
      @Param("id") int id,
      @Param("assigned_to") Ref<String> assignedTo,
      @Param("delegated_by") Ref<String> delegatedBy);

  int updateTaskStatus(
      @Param("project_id") int projectId,
      @Param("id") int id,
      @Param("status") TaskDescription.Status status,
      @Param("completion_summary") String completionSummary);

  int updateTaskReport(
      @Param("project_id") int projectId,
      @Param("id") int id,
      @Param("agent") Ref<String> agent,
      @Param("report") TaskReportDescription report);

  int countTasksByProject(@Param("project_id") int projectId);
}
