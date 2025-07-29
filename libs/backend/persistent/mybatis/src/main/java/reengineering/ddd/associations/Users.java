package reengineering.ddd.associations;

import jakarta.inject.Inject;
import org.springframework.stereotype.Component;
import reengineering.ddd.mappers.UsersMapper;
import reengineering.ddd.model.User;

import java.util.Optional;

@Component
public class Users implements reengineering.ddd.model.Users {
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
