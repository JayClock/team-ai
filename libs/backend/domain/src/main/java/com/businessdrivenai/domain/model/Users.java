package com.businessdrivenai.domain.model;

import com.businessdrivenai.domain.description.UserDescription;
import java.util.Optional;

public interface Users {
  Optional<User> findByIdentity(String id);

  User createUser(UserDescription description);

  void update(String id, User.UserChange request);
}
