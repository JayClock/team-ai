package com.businessdrivenai.persistence.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.businessdrivenai.domain.model.Project;
import com.businessdrivenai.persistence.TestContainerConfig;
import com.businessdrivenai.persistence.mybatis.mappers.ProjectsMapper;
import jakarta.inject.Inject;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;

@MybatisTest
@Import(TestContainerConfig.class)
public class ProjectsMapperTest {
  @Inject private ProjectsMapper mapper;
  @Inject private TestDataMapper testData;

  private final int projectId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void setup() {
    int userId = id();
    testData.insertUser(userId, "Test User", "test@example.com");
    testData.insertProject(projectId, userId, "Test Project");
  }

  @Test
  public void should_find_project_by_id() {
    Project foundProject = mapper.findProjectById(projectId);
    assertNotNull(foundProject);
    assertEquals(String.valueOf(projectId), foundProject.getIdentity());
    assertEquals("Test Project", foundProject.getDescription().name());
  }

  @Test
  public void should_return_empty_when_project_not_found() {
    Project notFoundProject = mapper.findProjectById(-1);
    assertNull(notFoundProject);
  }
}
