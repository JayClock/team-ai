package com.businessdrivenai.persistence.mybatis.mappers;

import com.businessdrivenai.domain.description.AccountDescription;
import com.businessdrivenai.domain.model.Account;
import com.businessdrivenai.persistence.support.IdHolder;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserAccountsMapper {
  Account findAccountByUserAndId(@Param("user_id") int userId, @Param("id") int id);

  int insertAccount(
      @Param("holder") IdHolder id,
      @Param("user_id") int userId,
      @Param("description") AccountDescription description);
}
