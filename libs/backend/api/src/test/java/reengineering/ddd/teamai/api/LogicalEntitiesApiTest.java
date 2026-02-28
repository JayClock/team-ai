package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.ws.rs.core.MediaType;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.teamai.description.EntityAttribute;
import reengineering.ddd.teamai.description.EntityBehavior;
import reengineering.ddd.teamai.description.EntityDefinition;
import reengineering.ddd.teamai.description.EvidenceSubType;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.description.LogicalEntityDescription.Type;
import reengineering.ddd.teamai.description.ParticipantSubType;
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
            new ProjectDescription("Test Project"),
            projectMembers,
            projectConversations,
            projectLogicalEntities,
            diagrams);

    logicalEntity =
        new LogicalEntity(
            "entity-1",
            new LogicalEntityDescription(
                Type.EVIDENCE, EvidenceSubType.RFP, "Order", "订单", definition));

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
        .body("type", is("EVIDENCE"))
        .body("name", is(logicalEntity.getDescription().name()))
        .body("label", is(logicalEntity.getDescription().label()))
        .body(
            "_links.self.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/logical-entities/"
                    + logicalEntity.getIdentity()))
        .body(
            "_links.collection.href",
            is("/api/projects/" + project.getIdentity() + "/logical-entities"))
        .body("_templates.default.method", is("PUT"))
        .body("_templates.default.properties", hasSize(5))
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

  @Test
  public void should_return_paginated_logical_entities_list() {
    LogicalEntity logicalEntity2 =
        new LogicalEntity(
            "entity-2",
            new LogicalEntityDescription(
                Type.PARTICIPANT, ParticipantSubType.PARTY, "Customer", "客户", null));

    when(projectLogicalEntities.findAll())
        .thenReturn(new EntityList<>(logicalEntity, logicalEntity2));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/projects/{projectId}/logical-entities", project.getIdentity())
        .then()
        .statusCode(200)
        .body("_embedded.logical-entities", hasSize(2))
        .body("_embedded.logical-entities[0].id", is(logicalEntity.getIdentity()))
        .body("_embedded.logical-entities[0].type", is("EVIDENCE"))
        .body("_embedded.logical-entities[0].name", is("Order"))
        .body("_embedded.logical-entities[1].id", is(logicalEntity2.getIdentity()))
        .body("_embedded.logical-entities[1].type", is("PARTICIPANT"))
        .body("_embedded.logical-entities[1].name", is("Customer"))
        .body("page.size", is(40))
        .body("page.totalElements", is(2))
        .body("page.totalPages", is(1))
        .body("page.number", is(0))
        .body(
            "_links.self.href",
            is("/api/projects/" + project.getIdentity() + "/logical-entities?page=0"));

    verify(projectLogicalEntities, times(1)).findAll();
  }

  @Test
  public void should_create_logical_entity() {
    LogicalEntity newEntity =
        new LogicalEntity(
            "entity-new",
            new LogicalEntityDescription(
                Type.PARTICIPANT, ParticipantSubType.PARTY, "Customer", "客户", null));

    when(projectLogicalEntities.add(any(LogicalEntityDescription.class))).thenReturn(newEntity);

    LogicalEntitiesApi.CreateLogicalEntityRequest request =
        new LogicalEntitiesApi.CreateLogicalEntityRequest();
    request.setType(Type.PARTICIPANT);
    request.setSubType(ParticipantSubType.PARTY);
    request.setName("Customer");
    request.setLabel("客户");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post("/projects/{projectId}/logical-entities", project.getIdentity())
        .then()
        .statusCode(201)
        .body("id", is(newEntity.getIdentity()))
        .body("type", is("PARTICIPANT"))
        .body("name", is("Customer"))
        .body("label", is("客户"))
        .body(
            "_links.self.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/logical-entities/"
                    + newEntity.getIdentity()));

    verify(projectLogicalEntities, times(1)).add(any(LogicalEntityDescription.class));
  }
}
