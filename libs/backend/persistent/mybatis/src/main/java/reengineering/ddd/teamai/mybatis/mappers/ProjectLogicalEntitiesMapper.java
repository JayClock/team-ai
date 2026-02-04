package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.model.LogicalEntity;

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
