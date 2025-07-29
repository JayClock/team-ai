package teamai.ddd.associations;

import jakarta.inject.Inject;
import org.springframework.stereotype.Component;
import teamai.ddd.mappers.UsersMapper;
import teamai.ddd.model.User;

import java.util.Optional;

@Component
public class Users implements teamai.ddd.model.Users {
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
