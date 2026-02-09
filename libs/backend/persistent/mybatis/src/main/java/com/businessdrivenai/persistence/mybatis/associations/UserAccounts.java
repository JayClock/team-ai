package com.businessdrivenai.persistence.mybatis.associations;

import com.businessdrivenai.domain.description.AccountDescription;
import com.businessdrivenai.domain.model.Account;
import com.businessdrivenai.domain.model.User;
import com.businessdrivenai.persistence.memory.EntityList;
import com.businessdrivenai.persistence.mybatis.cache.AssociationMapping;
import com.businessdrivenai.persistence.mybatis.mappers.UserAccountsMapper;
import com.businessdrivenai.persistence.support.IdHolder;
import jakarta.inject.Inject;
import org.springframework.cache.annotation.CacheEvict;

@AssociationMapping(entity = User.class, field = "accounts", parentIdField = "userId", eager = true)
public class UserAccounts extends EntityList<String, Account> implements User.Accounts {

  private static final String CACHE_NAME = "userAccounts";

  private int userId;

  @Inject UserAccountsMapper mapper;

  @Override
  @CacheEvict(value = CACHE_NAME, allEntries = true)
  public Account add(AccountDescription description) {
    IdHolder holder = new IdHolder();
    mapper.insertAccount(holder, userId, description);
    return mapper.findAccountByUserAndId(userId, holder.id());
  }
}
