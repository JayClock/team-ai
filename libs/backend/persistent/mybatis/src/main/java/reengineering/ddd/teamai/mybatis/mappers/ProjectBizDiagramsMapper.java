package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.BizDiagramDescription;
import reengineering.ddd.teamai.model.BizDiagram;

@Mapper
public interface ProjectBizDiagramsMapper {
  BizDiagram findDiagramByProjectAndId(@Param("project_id") int projectId, @Param("id") int id);

  List<BizDiagram> findDiagramsByProjectId(
      @Param("project_id") int projectId, @Param("from") int from, @Param("to") int to);

  int insertDiagram(
      @Param("holder") IdHolder holder,
      @Param("project_id") int projectId,
      @Param("description") BizDiagramDescription description);

  int countDiagramsByProject(@Param("project_id") int projectId);

  void deleteDiagram(@Param("project_id") int projectId, @Param("id") int id);
}
