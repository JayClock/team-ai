package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import reengineering.ddd.mybatis.memory.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.model.Account;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.mappers.AccountsMapper;

public class UserAccounts extends EntityList<String, Account> implements User.Accounts {
  private int userId;

  @Inject
  AccountsMapper mapper;


  @Override
  public Account add(AccountDescription description) {
    IdHolder holder = new IdHolder();
    mapper.insertAccount(holder, userId, description);
    return mapper.findAccountByUserAndId(userId, holder.id());
  }
}
