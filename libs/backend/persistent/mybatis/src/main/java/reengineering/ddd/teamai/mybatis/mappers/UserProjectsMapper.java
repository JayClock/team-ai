package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.Project;

@Mapper
public interface UserProjectsMapper {
  Project findProjectByUserAndId(@Param("user_id") int userId, @Param("id") int id);

  List<Project> findProjectsByUserId(
      @Param("user_id") int userId, @Param("from") int from, @Param("size") int size);

  int insertProject(
      @Param("holder") IdHolder holder,
      @Param("user_id") int userId,
      @Param("description") ProjectDescription description);

  int countProjectsByUser(@Param("user_id") int userId);

  int deleteProject(@Param("user_id") int userId, @Param("id") int id);
}
