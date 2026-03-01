package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.Mockito.when;
import static org.springframework.restdocs.request.RequestDocumentation.parameterWithName;
import static org.springframework.restdocs.request.RequestDocumentation.pathParameters;
import static org.springframework.restdocs.restassured.RestAssuredRestDocumentation.document;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.conversationsLink;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.halLinksSnippet;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.selfLink;

import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.Project;

public class ProjectsApiTest extends ApiTest {
  private Project project;

  @Mock private Project.Members projectMembers;
  @Mock private Project.Conversations projectConversations;
  @Mock private Project.LogicalEntities logicalEntities;
  @Mock private Project.Diagrams diagrams;

  @BeforeEach
  public void beforeEach() {
    project =
        new Project(
            "project-1",
            new ProjectDescription("Test Project"),
            projectMembers,
            projectConversations,
            logicalEntities,
            diagrams);
    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
  }

  @Test
  public void should_return_project_with_conversations_link() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .filter(
            document(
                "projects/get-project",
                pathParameters(
                    parameterWithName("projectId").description("Unique identifier of the project")),
                halLinksSnippet(selfLink(), conversationsLink())))
        .when()
        .get("/projects/{projectId}", project.getIdentity())
        .then()
        .statusCode(200)
        .contentType(startsWith(ResourceTypes.PROJECT))
        .body("id", is(project.getIdentity()))
        .body("name", is(project.getDescription().name()))
        .body("_links.self.href", is("/api/projects/" + project.getIdentity()))
        .body("_links.collection.href", is("/api/projects"))
        .body("_templates.delete-project.method", is("DELETE"))
        .body(
            "_links.conversations.href",
            is("/api/projects/" + project.getIdentity() + "/conversations"))
        .body("_templates.create-conversation.method", is("POST"))
        .body("_templates.create-conversation.properties", hasSize(1))
        .body("_templates.create-conversation.properties[0].name", is("title"))
        .body("_templates.create-conversation.properties[0].required", is(true))
        .body("_templates.create-conversation.properties[0].type", is("text"))
        .body("_links.diagrams.href", is("/api/projects/" + project.getIdentity() + "/diagrams"))
        .body("_templates.create-diagram.method", is("POST"))
        .body("_templates.create-diagram.properties", hasSize(1))
        .body("_templates.create-diagram.properties[0].name", is("title"))
        .body("_templates.create-diagram.properties[0].required", is(true))
        .body("_templates.create-diagram.properties[0].type", is("text"))
        .body(
            "_links.logical-entities.href",
            is("/api/projects/" + project.getIdentity() + "/logical-entities"))
        .body(
            "_links.knowledge-graph.href",
            is("/api/projects/" + project.getIdentity() + "/knowledge-graph"))
        .body("_templates.create-logical-entity.method", is("POST"))
        .body("_templates.create-logical-entity.properties", hasSize(4))
        .body("_templates.create-logical-entity.properties[0].name", is("label"))
        .body("_templates.create-logical-entity.properties[0].type", is("text"))
        .body("_templates.create-logical-entity.properties[1].name", is("name"))
        .body("_templates.create-logical-entity.properties[1].required", is(true))
        .body("_templates.create-logical-entity.properties[1].type", is("text"))
        .body("_templates.create-logical-entity.properties[2].name", is("subType"))
        .body("_templates.create-logical-entity.properties[2].options.inline", hasSize(14))
        .body("_templates.create-logical-entity.properties[2].options.promptField", is("prompt"))
        .body("_templates.create-logical-entity.properties[2].options.valueField", is("value"))
        .body("_templates.create-logical-entity.properties[2].options.maxItems", is(1))
        .body("_templates.create-logical-entity.properties[2].options.minItems", is(0))
        .body(
            "_templates.create-logical-entity.properties[2].options.inline.value",
            containsInAnyOrder(
                "EVIDENCE:rfp",
                "EVIDENCE:proposal",
                "EVIDENCE:contract",
                "EVIDENCE:fulfillment_request",
                "EVIDENCE:fulfillment_confirmation",
                "EVIDENCE:other_evidence",
                "PARTICIPANT:party",
                "PARTICIPANT:thing",
                "ROLE:party_role",
                "ROLE:domain_logic_role",
                "ROLE:third_party_role",
                "ROLE:context_role",
                "ROLE:evidence_role",
                "CONTEXT:bounded_context"))
        .body("_templates.create-logical-entity.properties[3].name", is("type"))
        .body("_templates.create-logical-entity.properties[3].required", is(true))
        .body("_templates.create-logical-entity.properties[3].options.inline", hasSize(4))
        .body("_templates.create-logical-entity.properties[3].options.promptField", is("prompt"))
        .body("_templates.create-logical-entity.properties[3].options.valueField", is("value"))
        .body("_templates.create-logical-entity.properties[3].options.maxItems", is(1))
        .body("_templates.create-logical-entity.properties[3].options.minItems", is(1))
        .body(
            "_templates.create-logical-entity.properties[3].options.inline.value",
            containsInAnyOrder("EVIDENCE", "PARTICIPANT", "ROLE", "CONTEXT"));
  }
}
