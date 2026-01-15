package reengineering.ddd.teamai.mybatis.associations;

import static reengineering.ddd.teamai.mybatis.config.CacheConfig.CACHE_USER_ACCOUNTS;

import jakarta.inject.Inject;
import org.springframework.cache.annotation.CacheEvict;
import reengineering.ddd.mybatis.memory.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.model.Account;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.mappers.UserAccountsMapper;

public class UserAccounts extends EntityList<String, Account> implements User.Accounts {
  private int userId;

  @Inject UserAccountsMapper mapper;

  @Override
  @CacheEvict(value = CACHE_USER_ACCOUNTS, allEntries = true)
  public Account add(AccountDescription description) {
    IdHolder holder = new IdHolder();
    mapper.insertAccount(holder, userId, description);
    return mapper.findAccountByUserAndId(userId, holder.id());
  }

  /** Getter for SpEL access to userId */
  public int getUserId() {
    return userId;
  }
}
