package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.mappers.UsersMapper;

import java.util.Optional;

@Component
public class Users implements reengineering.ddd.teamai.model.Users {
  private final UsersMapper mapper;

  @Inject
  public Users(UsersMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  public Optional<User> findById(String id) {
    return Optional.ofNullable(mapper.findUserById(id));
  }
}
