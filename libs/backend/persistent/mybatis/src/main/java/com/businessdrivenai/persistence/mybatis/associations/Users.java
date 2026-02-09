package com.businessdrivenai.persistence.mybatis.associations;

import com.businessdrivenai.domain.description.UserDescription;
import com.businessdrivenai.domain.model.User;
import com.businessdrivenai.persistence.mybatis.mappers.UsersMapper;
import com.businessdrivenai.persistence.support.IdHolder;
import jakarta.inject.Inject;
import java.util.Optional;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;

@Component
public class Users implements com.businessdrivenai.domain.model.Users {

  private static final String CACHE_NAME = "users";

  private final UsersMapper mapper;

  @Inject
  public Users(UsersMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  @Cacheable(value = CACHE_NAME, key = "#id", unless = "#result == null")
  public Optional<User> findByIdentity(String id) {
    return Optional.ofNullable(mapper.findUserById(Integer.parseInt(id)));
  }

  @Override
  @CacheEvict(value = CACHE_NAME, key = "#result.getIdentity()")
  public User createUser(UserDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertUser(idHolder, description);
    return mapper.findUserById(idHolder.id());
  }

  @Override
  @CacheEvict(value = CACHE_NAME, key = "#id")
  public void update(String id, User.UserChange request) {
    mapper.updateUser(Integer.parseInt(id), request);
  }
}
