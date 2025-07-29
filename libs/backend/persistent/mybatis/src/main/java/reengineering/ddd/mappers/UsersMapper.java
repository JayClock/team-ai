package reengineering.ddd.mappers;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.model.User;

@Mapper
public interface UsersMapper {
  User findUserById(@Param("id") String id);
}
