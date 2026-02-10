package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.teamai.model.Project;

@Mapper
public interface ProjectsMapper {
  Project findProjectById(@Param("id") int id);

  List<Project> findAllProjects(@Param("from") int from, @Param("size") int size);

  int countAllProjects();

  List<Integer> findProjectMemberIds(@Param("id") int id);

  void deleteProject(@Param("id") int id);
}
