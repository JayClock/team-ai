package reengineering.ddd.teamai.mybatis.mappers;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.User;

@Mapper
public interface
UsersMapper {
  User findUserById(@Param("id") String id);

  int insertUser(@Param("holder") IdHolder id, @Param("description") UserDescription userDescription);
}
