package com.businessdrivenai.persistence.mybatis.mappers;

import com.businessdrivenai.domain.description.NodeDescription;
import com.businessdrivenai.domain.model.DiagramNode;
import com.businessdrivenai.persistence.support.IdHolder;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface DiagramNodesMapper {
  DiagramNode findNodeByDiagramAndId(@Param("diagram_id") int diagramId, @Param("id") int id);

  List<DiagramNode> findNodesByDiagramId(@Param("diagram_id") int diagramId);

  int insertNode(
      @Param("holder") IdHolder holder,
      @Param("diagram_id") int diagramId,
      @Param("description") NodeDescription description);

  int countNodesByDiagram(@Param("diagram_id") int diagramId);
}
