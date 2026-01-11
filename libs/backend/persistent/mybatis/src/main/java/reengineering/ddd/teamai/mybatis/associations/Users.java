package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.Optional;
import org.springframework.stereotype.Component;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.mappers.UsersMapper;

@Component
public class Users implements reengineering.ddd.teamai.model.Users {
  private final UsersMapper mapper;

  @Inject
  public Users(UsersMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  public Optional<User> findById(String id) {
    return Optional.ofNullable(mapper.findUserById(Integer.parseInt(id)));
  }

  @Override
  public User createUser(UserDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertUser(idHolder, description);
    return mapper.findUserById(idHolder.id());
  }
}
