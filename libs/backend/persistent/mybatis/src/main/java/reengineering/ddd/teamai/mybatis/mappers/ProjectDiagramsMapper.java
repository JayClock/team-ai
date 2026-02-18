package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramStatus;

@Mapper
public interface ProjectDiagramsMapper {
  Diagram findDiagramByProjectAndId(@Param("project_id") int projectId, @Param("id") int id);

  List<Diagram> findDiagramsByProjectId(
      @Param("project_id") int projectId, @Param("from") int from, @Param("size") int size);

  int insertDiagram(
      @Param("holder") IdHolder holder,
      @Param("project_id") int projectId,
      @Param("description") DiagramDescription description);

  int countDiagramsByProject(@Param("project_id") int projectId);

  int updateDiagramStatus(
      @Param("project_id") int projectId,
      @Param("id") int diagramId,
      @Param("status") DiagramStatus status);
}
