package reengineering.ddd.teamai.mybatis.mappers;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.LocalCredentialDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.LocalCredential;
import reengineering.ddd.teamai.model.User;

@Mapper
public interface UsersMapper {
  User findUserById(@Param("id") int id);

  User findUserByUsername(@Param("username") String username);

  User findUserByEmail(@Param("email") String email);

  LocalCredential findCredentialByUserId(@Param("user_id") int userId);

  int upsertCredential(
      @Param("user_id") int userId, @Param("description") LocalCredentialDescription description);

  int insertUser(
      @Param("holder") IdHolder id, @Param("description") UserDescription userDescription);

  int updateUser(@Param("id") int id, @Param("request") UserDescription request);
}
