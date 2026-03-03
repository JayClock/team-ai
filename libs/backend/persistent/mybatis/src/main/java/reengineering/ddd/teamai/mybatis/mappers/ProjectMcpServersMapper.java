package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.McpServerDescription;
import reengineering.ddd.teamai.model.McpServer;

@Mapper
public interface ProjectMcpServersMapper {
  McpServer findMcpServerByProjectAndId(@Param("project_id") int projectId, @Param("id") int id);

  List<McpServer> findMcpServersByProjectId(
      @Param("project_id") int projectId, @Param("from") int from, @Param("size") int size);

  int countMcpServersByProject(@Param("project_id") int projectId);

  int insertMcpServer(
      @Param("holder") IdHolder holder,
      @Param("project_id") int projectId,
      @Param("description") McpServerDescription description);

  int updateMcpServer(
      @Param("project_id") int projectId,
      @Param("id") int id,
      @Param("description") McpServerDescription description);

  int deleteMcpServer(@Param("project_id") int projectId, @Param("id") int id);
}
