package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.inject.Inject;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.TestDataMapper;
import reengineering.ddd.teamai.mybatis.mappers.ProjectsMapper;

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
    testData.insertProject(projectId, userId, "Test Project", "test model");
  }

  @Test
  public void should_find_project_by_id() {
    var foundProject = mapper.findProjectById(projectId);
    assertTrue(foundProject.isPresent());
    assertEquals(String.valueOf(projectId), foundProject.get().getIdentity());
    assertEquals("Test Project", foundProject.get().getDescription().name());
    assertEquals("test model", foundProject.get().getDescription().domainModel());
  }

  @Test
  public void should_return_empty_when_project_not_found() {
    var foundProject = mapper.findProjectById(-1);
    assertTrue(foundProject.isEmpty());
  }
}
