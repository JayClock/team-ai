package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;

import jakarta.inject.Inject;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.BizDiagramDescription;
import reengineering.ddd.teamai.model.BizDiagram;
import reengineering.ddd.teamai.mybatis.mappers.ProjectBizDiagramsMapper;

@MybatisTest
@Import(TestContainerConfig.class)
public class ProjectBizDiagramsMapperTest {
  @Inject private reengineering.ddd.TestDataMapper testData;
  @Inject private ProjectBizDiagramsMapper bizDiagramsMapper;

  private final int userId = id();
  private final int projectId = id();
  private final int bizDiagramId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "Test Project" + projectId, "domain model content");
    testData.insertBizDiagram(
        bizDiagramId,
        projectId,
        "Test Diagram",
        "Diagram description",
        "@startuml\ntest\n@enduml",
        "flowchart");
  }

  @Test
  void should_find_diagram_by_project_and_id() {
    BizDiagram bizDiagram = bizDiagramsMapper.findDiagramByProjectAndId(projectId, bizDiagramId);
    assertEquals(String.valueOf(bizDiagramId), bizDiagram.getIdentity());
    assertEquals("Test Diagram", bizDiagram.getDescription().name());
  }

  @Test
  void should_add_diagram_to_database() {
    IdHolder idHolder = new IdHolder();
    bizDiagramsMapper.insertDiagram(
        idHolder,
        projectId,
        new BizDiagramDescription(
            "New Diagram", "New description", "@startuml\nnew\n@enduml", "sequence"));
    BizDiagram bizDiagram = bizDiagramsMapper.findDiagramByProjectAndId(projectId, idHolder.id());
    assertEquals("New Diagram", bizDiagram.getDescription().name());
    assertEquals("New description", bizDiagram.getDescription().description());
    assertEquals("@startuml\nnew\n@enduml", bizDiagram.getDescription().plantumlCode());
    assertEquals("sequence", bizDiagram.getDescription().diagramType());
  }

  @Test
  public void should_count_diagrams_by_project() {
    int count = bizDiagramsMapper.countDiagramsByProject(projectId);
    assertEquals(1, count);
  }

  @Test
  public void should_find_diagrams_by_project_id_with_pagination() {
    List<BizDiagram> bizDiagrams = bizDiagramsMapper.findDiagramsByProjectId(projectId, 0, 10);
    assertEquals(1, bizDiagrams.size());
    assertEquals(String.valueOf(bizDiagramId), bizDiagrams.get(0).getIdentity());
  }

  @Test
  public void should_delete_diagram() {
    bizDiagramsMapper.deleteDiagram(projectId, bizDiagramId);
    BizDiagram bizDiagram = bizDiagramsMapper.findDiagramByProjectAndId(projectId, bizDiagramId);
    assertEquals(null, bizDiagram);
  }
}
