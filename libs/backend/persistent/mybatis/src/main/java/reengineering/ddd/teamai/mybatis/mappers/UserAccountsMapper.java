package reengineering.ddd.teamai.mybatis.mappers;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.model.Account;

@Mapper
public interface AccountsMapper {
  Account findAccountByUserAndId(@Param("user_id") int userId, @Param("id") int id);

  int insertAccount(@Param("holder") IdHolder id, @Param("user_id") int userId, @Param("description") AccountDescription description);
}
