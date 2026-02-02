package reengineering.ddd.teamai.mybatis.mappers;

import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.teamai.model.Project;

@Mapper
public interface ProjectsMapper {
  Optional<Project> findProjectById(@Param("id") int id);
}
