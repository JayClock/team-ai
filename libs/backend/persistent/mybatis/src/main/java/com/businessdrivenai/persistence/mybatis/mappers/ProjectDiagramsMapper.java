package com.businessdrivenai.persistence.mybatis.mappers;

import com.businessdrivenai.domain.description.DiagramDescription;
import com.businessdrivenai.domain.model.Diagram;
import com.businessdrivenai.persistence.support.IdHolder;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

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
}
