package com.businessdrivenai.persistence.mybatis.mappers;

import com.businessdrivenai.domain.description.EdgeDescription;
import com.businessdrivenai.domain.model.DiagramEdge;
import com.businessdrivenai.persistence.support.IdHolder;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

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
