package com.businessdrivenai.domain.model;

import java.util.Optional;

public interface Projects {
  Optional<Project> findByIdentity(String id);
}
