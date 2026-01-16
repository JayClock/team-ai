package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import org.springframework.cache.annotation.CacheEvict;
import reengineering.ddd.mybatis.memory.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.model.Account;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.UserAccountsMapper;

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
