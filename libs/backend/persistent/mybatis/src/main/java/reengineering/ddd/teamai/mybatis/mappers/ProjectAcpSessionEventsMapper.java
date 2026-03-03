package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ProjectAcpSessionEventsMapper {
  int insertEvent(
      @Param("project_id") int projectId,
      @Param("session_id") int sessionId,
      @Param("event") ProjectAcpSessionEventRow event);

  List<ProjectAcpSessionEventRow> findEventsBySession(
      @Param("project_id") int projectId,
      @Param("session_id") int sessionId,
      @Param("after_event_id") String afterEventId,
      @Param("size") int size);
}
