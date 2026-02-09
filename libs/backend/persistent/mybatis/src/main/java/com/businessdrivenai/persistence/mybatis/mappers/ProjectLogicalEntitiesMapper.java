package com.businessdrivenai.persistence.mybatis.mappers;

import com.businessdrivenai.domain.description.LogicalEntityDescription;
import com.businessdrivenai.domain.model.LogicalEntity;
import com.businessdrivenai.persistence.support.IdHolder;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ProjectLogicalEntitiesMapper {
  LogicalEntity findLogicalEntityByProjectAndId(
      @Param("project_id") int projectId, @Param("id") int id);

  List<LogicalEntity> findLogicalEntitiesByProjectId(
      @Param("project_id") int projectId, @Param("from") int from, @Param("size") int size);

  int insertLogicalEntity(
      @Param("holder") IdHolder holder,
      @Param("project_id") int projectId,
      @Param("description") LogicalEntityDescription description);

  int countLogicalEntitiesByProject(@Param("project_id") int projectId);
}
