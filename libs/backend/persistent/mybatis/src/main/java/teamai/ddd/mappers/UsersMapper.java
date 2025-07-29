package teamai.ddd.mappers;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import teamai.ddd.model.User;

@Mapper
public interface UsersMapper {
  User findUserById(@Param("id") String id);
}
