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

  List<DiagramNode> findNodesByDiagramId(@Param("diagram_id") int diagramId);

  int insertNode(
      @Param("holder") IdHolder holder,
      @Param("diagram_id") int diagramId,
      @Param("description") NodeDescription description);

  int updateNode(
      @Param("diagram_id") int diagramId,
      @Param("id") int id,
      @Param("description") NodeDescription description);

  int deleteNodesByIds(@Param("diagram_id") int diagramId, @Param("ids") List<Integer> ids);

  List<Integer> findNodeIdsWithoutLogicalEntityForPublish(
      @Param("project_id") int projectId, @Param("diagram_id") int diagramId);

  int promoteNodeLocalDataToLogicalEntity(
      @Param("project_id") int projectId,
      @Param("diagram_id") int diagramId,
      @Param("node_id") int nodeId);

  int countNodesByDiagram(@Param("diagram_id") int diagramId);
}
