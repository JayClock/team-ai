package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.DiagramVersionDescription;
import reengineering.ddd.teamai.model.DiagramVersion;

@Mapper
public interface DiagramVersionsMapper {
  DiagramVersion findVersionByDiagramAndId(@Param("diagram_id") int diagramId, @Param("id") int id);

  List<DiagramVersion> findVersionsByDiagramId(
      @Param("diagram_id") int diagramId, @Param("from") int from, @Param("size") int size);

  int insertVersion(
      @Param("holder") IdHolder holder,
      @Param("diagram_id") int diagramId,
      @Param("description") DiagramVersionDescription description);

  int countVersionsByDiagram(@Param("diagram_id") int diagramId);
}
