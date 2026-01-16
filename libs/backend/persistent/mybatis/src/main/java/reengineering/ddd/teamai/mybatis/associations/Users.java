package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.Optional;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.mappers.UsersMapper;

@Component
public class Users implements reengineering.ddd.teamai.model.Users {

  private static final String CACHE_NAME = "users";

  private final UsersMapper mapper;

  @Inject
  public Users(UsersMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  @Cacheable(value = CACHE_NAME, key = "#id", unless = "#result == null")
  public Optional<User> findById(String id) {
    return Optional.ofNullable(mapper.findUserById(Integer.parseInt(id)));
  }

  @Override
  @CacheEvict(value = CACHE_NAME, key = "#result.getIdentity()")
  public User createUser(UserDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertUser(idHolder, description);
    return mapper.findUserById(idHolder.id());
  }
}
