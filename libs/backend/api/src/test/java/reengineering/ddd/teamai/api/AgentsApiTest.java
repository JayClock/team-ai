package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.ws.rs.core.MediaType;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.Project;

public class AgentsApiTest extends ApiTest {
  private Project project;
  private Agent agent;

  @Mock private Project.Members members;
  @Mock private Project.Conversations conversations;
  @Mock private Project.LogicalEntities logicalEntities;
  @Mock private Project.Diagrams diagrams;
  @Mock private Project.Agents agents;
  @Mock private Project.Tasks tasks;
  @Mock private Project.AgentEvents events;

  @BeforeEach
  void beforeEach() {
    project =
        new Project(
            "project-1",
            new ProjectDescription("Test Project"),
            members,
            conversations,
            logicalEntities,
            diagrams,
            agents,
            tasks,
            events);
    agent =
        new Agent(
            "agent-1",
            new AgentDescription(
                "Crafter",
                AgentDescription.Role.CRAFTER,
                "SMART",
                AgentDescription.Status.PENDING,
                null));

    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
    when(agents.findAll()).thenReturn(new EntityList<>(agent));
    when(agents.findByIdentity(agent.getIdentity())).thenReturn(Optional.of(agent));
  }

  @Test
  void should_return_agents_collection_with_create_rel() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/projects/{projectId}/agents", project.getIdentity())
        .then()
        .statusCode(200)
        .body("_embedded.agents", hasSize(1))
        .body("_embedded.agents[0].id", is(agent.getIdentity()))
        .body("_links.self.href", is("/api/projects/" + project.getIdentity() + "/agents?page=0"))
        .body("_links.create-agent.href", is("/api/projects/" + project.getIdentity() + "/agents"))
        .body("_templates.create-agent.method", is("POST"));
  }

  @Test
  void should_create_agent() {
    Agent created =
        new Agent(
            "agent-2",
            new AgentDescription(
                "Gate", AgentDescription.Role.GATE, "FAST", AgentDescription.Status.PENDING, null));
    when(agents.create(any(AgentDescription.class))).thenReturn(created);

    AgentsApi.CreateAgentRequest request = new AgentsApi.CreateAgentRequest();
    request.setName("Gate");
    request.setRole(AgentDescription.Role.GATE);
    request.setModelTier("FAST");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post("/projects/{projectId}/agents", project.getIdentity())
        .then()
        .statusCode(201)
        .body("id", is(created.getIdentity()))
        .body("name", is("Gate"))
        .body("_links.collection.href", is("/api/projects/" + project.getIdentity() + "/agents"));

    verify(agents, times(1)).create(any(AgentDescription.class));
  }
}
