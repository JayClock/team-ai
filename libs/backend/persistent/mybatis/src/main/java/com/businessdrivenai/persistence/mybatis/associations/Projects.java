package com.businessdrivenai.persistence.mybatis.associations;

import com.businessdrivenai.domain.model.Project;
import com.businessdrivenai.persistence.mybatis.mappers.ProjectsMapper;
import jakarta.inject.Inject;
import java.util.Optional;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;

@Component
public class Projects implements com.businessdrivenai.domain.model.Projects {

  private static final String CACHE_NAME = "projects";

  private final ProjectsMapper mapper;

  @Inject
  public Projects(ProjectsMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  @Cacheable(value = CACHE_NAME, key = "#id", unless = "#result == null")
  public Optional<Project> findByIdentity(String id) {
    return Optional.ofNullable(mapper.findProjectById(Integer.parseInt(id)));
  }
}
