package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.EntityAttribute;
import reengineering.ddd.teamai.description.EntityBehavior;
import reengineering.ddd.teamai.description.EntityDefinition;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.LogicalEntity;
import reengineering.ddd.teamai.model.Project;

public class LogicalEntitiesApiTest extends ApiTest {
  private Project project;
  private LogicalEntity logicalEntity;

  @Mock private Project.Members projectMembers;
  @Mock private Project.Conversations projectConversations;
  @Mock private Project.LogicalEntities projectLogicalEntities;
  @Mock private Project.Diagrams diagrams;

  @BeforeEach
  public void beforeEach() {
    EntityAttribute attribute =
        new EntityAttribute("attr-1", "orderId", "订单编号", "UUID", "全局唯一标识", true, false, "public");
    EntityBehavior behavior = new EntityBehavior("m-1", "pay()", "支付", "触发支付流程", "void");
    EntityDefinition definition =
        new EntityDefinition(
            "客户购买商品生成的交易凭证", List.of("Core Domain"), List.of(attribute), List.of(behavior));

    project =
        new Project(
            "project-1",
            new ProjectDescription("Test Project", "domain-model"),
            projectMembers,
            projectConversations,
            projectLogicalEntities,
            diagrams);

    logicalEntity =
        new LogicalEntity(
            "entity-1",
            new LogicalEntityDescription(
                "AGGREGATE", "Order", "订单", definition, "DRAFT", new Ref<>(project.getIdentity())));

    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
    when(projectLogicalEntities.findByIdentity(logicalEntity.getIdentity()))
        .thenReturn(Optional.of(logicalEntity));
  }

  @Test
  public void should_return_single_logical_entity() {

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get(
            "/projects/{projectId}/logical-entities/{id}",
            project.getIdentity(),
            logicalEntity.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(logicalEntity.getIdentity()))
        .body("type", is(logicalEntity.getDescription().type()))
        .body("name", is(logicalEntity.getDescription().name()))
        .body("label", is(logicalEntity.getDescription().label()))
        .body("status", is(logicalEntity.getDescription().status()))
        .body(
            "_links.self.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/logical-entities/"
                    + logicalEntity.getIdentity()))
        .body(
            "_links.logical-entities.href",
            is("/api/projects/" + project.getIdentity() + "/logical-entities"))
        .body("_templates.default.method", is("PUT"))
        .body("_templates.default.properties", hasSize(6))
        .body("_templates.delete-logical-entity.method", is("DELETE"));

    verify(projectLogicalEntities, times(1)).findByIdentity(logicalEntity.getIdentity());
  }

  @Test
  public void should_return_404_when_getting_non_existent_logical_entity() {
    when(projectLogicalEntities.findByIdentity("non-existent")).thenReturn(Optional.empty());

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON.toString())
        .when()
        .get("/projects/{projectId}/logical-entities/{id}", project.getIdentity(), "non-existent")
        .then()
        .statusCode(404);
  }
}
