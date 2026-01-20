package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import jakarta.inject.Inject;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.mybatis.mappers.UserProjectsMapper;

@MybatisTest
@Import(TestContainerConfig.class)
public class UserProjectsMapperTest {
  @Inject private reengineering.ddd.TestDataMapper testData;
  @Inject private UserProjectsMapper projectsMapper;

  private final int userId = id();
  private final int projectId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "Test Project" + projectId, "domain model content");
  }

  @Test
  void should_find_project_by_user_and_id() {
    Project project = projectsMapper.findProjectByUserAndId(userId, projectId);
    assertEquals(String.valueOf(projectId), project.getIdentity());
    assertEquals("Test Project" + projectId, project.getDescription().name());
  }

  @Test
  void should_assign_conversations_association_of_project() {
    Project project = projectsMapper.findProjectByUserAndId(userId, projectId);
    assertNotNull(project.conversations());
  }

  @Test
  public void should_add_project_to_database() {
    IdHolder idHolder = new IdHolder();
    projectsMapper.insertProject(
        idHolder, userId, new ProjectDescription("New Project", "new domain model"));
    Project project = projectsMapper.findProjectByUserAndId(userId, idHolder.id());
    assertEquals("New Project", project.getDescription().name());
    assertEquals("new domain model", project.getDescription().domainModel());
  }

  @Test
  public void should_count_projects_by_user() {
    int count = projectsMapper.countProjectsByUser(userId);
    assertEquals(1, count);
  }

  @Test
  public void should_find_projects_by_user_id_with_pagination() {
    List<Project> projects = projectsMapper.findProjectsByUserId(userId, 0, 10);
    assertEquals(1, projects.size());
    assertEquals(String.valueOf(projectId), projects.get(0).getIdentity());
  }

  @Test
  public void should_delete_project() {
    int result = projectsMapper.deleteProject(userId, projectId);
    assertEquals(0, result);
    Project project = projectsMapper.findProjectByUserAndId(userId, projectId);
    assertEquals(null, project);
  }
}
