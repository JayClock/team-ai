package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.Viewport;

public class DiagramTest {
  private Diagram diagram;
  private DiagramDescription description;
  private Viewport viewport;

  @BeforeEach
  public void setUp() {
    viewport = new Viewport(100, 50, 1.5);
    Ref<String> projectRef = new Ref<>("project-1");
    description = new DiagramDescription("下单流程上下文图", DiagramType.CLASS, viewport, projectRef);
    diagram = new Diagram("diagram-1", "project-1", description);
  }

  @Test
  public void should_return_identity() {
    assertEquals("diagram-1", diagram.getIdentity());
  }

  @Test
  public void should_return_description() {
    assertEquals(description, diagram.getDescription());
  }

  @Test
  public void should_return_diagram_title() {
    assertEquals("下单流程上下文图", diagram.getDescription().title());
  }

  @Test
  public void should_return_diagram_type() {
    assertEquals(DiagramType.CLASS, diagram.getDescription().type());
  }

  @Test
  public void should_return_diagram_type_value() {
    assertEquals("class", diagram.getDescription().type().getValue());
  }

  @Test
  public void should_return_viewport() {
    Viewport resultViewport = diagram.getDescription().viewport();
    assertNotNull(resultViewport);
    assertEquals(100, resultViewport.x());
    assertEquals(50, resultViewport.y());
    assertEquals(1.5, resultViewport.zoom());
  }

  @Test
  public void should_return_project_reference() {
    Ref<String> projectRef = diagram.getDescription().project();
    assertNotNull(projectRef);
    assertEquals("project-1", projectRef.id());
  }

  @Test
  public void should_create_diagram_with_default_viewport() {
    Ref<String> projectRef = new Ref<>("project-2");
    DiagramDescription descriptionWithDefaultViewport =
        new DiagramDescription(
            "会员体系图", DiagramType.SEQUENCE, Viewport.defaultViewport(), projectRef);
    Diagram diagramWithDefaultViewport =
        new Diagram("diagram-2", "project-2", descriptionWithDefaultViewport);

    Viewport defaultViewport = diagramWithDefaultViewport.getDescription().viewport();
    assertEquals(0, defaultViewport.x());
    assertEquals(0, defaultViewport.y());
    assertEquals(1, defaultViewport.zoom());
  }

  @Test
  public void should_return_project_id() {
    assertEquals("project-1", diagram.getProjectId());
  }

  @Test
  public void should_support_all_diagram_types() {
    Ref<String> projectRef = new Ref<>("project-3");

    Diagram flowchartDiagram =
        new Diagram(
            "flow-1",
            "project-3",
            new DiagramDescription("流程图", DiagramType.FLOWCHART, viewport, projectRef));
    assertEquals(DiagramType.FLOWCHART, flowchartDiagram.getDescription().type());

    Diagram sequenceDiagram =
        new Diagram(
            "seq-1",
            "project-3",
            new DiagramDescription("时序图", DiagramType.SEQUENCE, viewport, projectRef));
    assertEquals(DiagramType.SEQUENCE, sequenceDiagram.getDescription().type());

    Diagram classDiagram =
        new Diagram(
            "class-1",
            "project-3",
            new DiagramDescription("类图", DiagramType.CLASS, viewport, projectRef));
    assertEquals(DiagramType.CLASS, classDiagram.getDescription().type());

    Diagram componentDiagram =
        new Diagram(
            "comp-1",
            "project-3",
            new DiagramDescription("组件图", DiagramType.COMPONENT, viewport, projectRef));
    assertEquals(DiagramType.COMPONENT, componentDiagram.getDescription().type());

    Diagram stateDiagram =
        new Diagram(
            "state-1",
            "project-3",
            new DiagramDescription("状态图", DiagramType.STATE, viewport, projectRef));
    assertEquals(DiagramType.STATE, stateDiagram.getDescription().type());

    Diagram activityDiagram =
        new Diagram(
            "act-1",
            "project-3",
            new DiagramDescription("活动图", DiagramType.ACTIVITY, viewport, projectRef));
    assertEquals(DiagramType.ACTIVITY, activityDiagram.getDescription().type());
  }
}
