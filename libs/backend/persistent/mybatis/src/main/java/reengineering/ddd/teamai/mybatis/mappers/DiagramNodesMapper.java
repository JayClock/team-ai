package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.model.DiagramNode;

@Mapper
public interface DiagramNodesMapper {
  DiagramNode findNodeByDiagramAndId(@Param("diagram_id") int diagramId, @Param("id") int id);

  List<DiagramNode> findNodesByDiagramId(
      @Param("diagram_id") int diagramId, @Param("from") int from, @Param("size") int size);

  int insertNode(
      @Param("holder") IdHolder holder,
      @Param("diagram_id") int diagramId,
      @Param("description") NodeDescription description);

  int countNodesByDiagram(@Param("diagram_id") int diagramId);
}
