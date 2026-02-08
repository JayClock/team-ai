package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.model.DiagramEdge;

@Mapper
public interface DiagramEdgesMapper {
  DiagramEdge findEdgeByDiagramAndId(@Param("diagram_id") int diagramId, @Param("id") int id);

  List<DiagramEdge> findEdgesByDiagramId(@Param("diagram_id") int diagramId);

  int insertEdge(
      @Param("holder") IdHolder holder,
      @Param("diagram_id") int diagramId,
      @Param("description") EdgeDescription description);

  int countEdgesByDiagram(@Param("diagram_id") int diagramId);
}
