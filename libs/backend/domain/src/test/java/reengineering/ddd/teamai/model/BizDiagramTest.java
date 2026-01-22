package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reengineering.ddd.teamai.description.BizDiagramDescription;

public class BizDiagramTest {
  private BizDiagram bizDiagram;
  private BizDiagramDescription bizDiagramDescription;

  @BeforeEach
  public void setUp() {
    bizDiagramDescription =
        new BizDiagramDescription(
            "Test Diagram", "Test Description", "@startuml\n@enduml", "sequence");
    bizDiagram = new BizDiagram("diag-1", bizDiagramDescription);
  }

  @Test
  public void should_return_identity() {
    assertEquals("diag-1", bizDiagram.getIdentity());
  }

  @Test
  public void should_return_description() {
    assertEquals(bizDiagramDescription, bizDiagram.getDescription());
  }

  @Test
  public void should_return_name_from_description() {
    assertEquals("Test Diagram", bizDiagram.getDescription().name());
  }

  @Test
  public void should_return_description_from_description() {
    assertEquals("Test Description", bizDiagram.getDescription().description());
  }

  @Test
  public void should_return_plantuml_code_from_description() {
    assertEquals("@startuml\n@enduml", bizDiagram.getDescription().plantumlCode());
  }

  @Test
  public void should_return_diagram_type_from_description() {
    assertEquals("sequence", bizDiagram.getDescription().diagramType());
  }

  @Test
  public void should_create_biz_diagram_with_different_types() {
    BizDiagramDescription classDiagramDescription =
        new BizDiagramDescription(
            "Class Diagram", "Class diagram description", "class Main{}", "class");
    BizDiagram classDiagram = new BizDiagram("diag-2", classDiagramDescription);

    assertEquals("diag-2", classDiagram.getIdentity());
    assertEquals("Class Diagram", classDiagram.getDescription().name());
    assertEquals("class", classDiagram.getDescription().diagramType());
  }

  @Test
  public void should_create_biz_diagram_with_complex_plantuml_code() {
    BizDiagramDescription complexDiagramDescription =
        new BizDiagramDescription(
            "Complex Diagram",
            "Complex diagram description",
            "@startuml\nclass User\nclass Admin\nUser --|> Admin\n@enduml",
            "class");
    BizDiagram complexDiagram = new BizDiagram("diag-3", complexDiagramDescription);

    assertTrue(complexDiagram.getDescription().plantumlCode().contains("class User"));
    assertTrue(complexDiagram.getDescription().plantumlCode().contains("class Admin"));
  }
}
