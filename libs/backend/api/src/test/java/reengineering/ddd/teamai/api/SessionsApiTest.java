package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AcpSessionDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.AcpSession;
import reengineering.ddd.teamai.model.Project;

class SessionsApiTest extends ApiTest {
  private static final Instant STARTED_AT = Instant.parse("2026-03-03T10:00:00Z");
  private static final Instant LAST_ACTIVITY_AT = Instant.parse("2026-03-03T10:01:00Z");
  private static final Instant COMPLETED_AT = Instant.parse("2026-03-03T10:02:00Z");

  private Project project;

  @Mock private Project.Members projectMembers;
  @Mock private Project.Conversations projectConversations;
  @Mock private Project.LogicalEntities logicalEntities;
  @Mock private Project.Diagrams diagrams;
  @Mock private Project.Agents agents;
  @Mock private Project.Tasks tasks;
  @Mock private Project.AgentEvents events;
  @Mock private Project.OrchestrationSessions orchestrationSessions;
  @Mock private Project.AcpSessions acpSessions;

  @BeforeEach
  void beforeEach() {
    project =
        new Project(
            "project-1",
            new ProjectDescription("Acp Session Project"),
            projectMembers,
            projectConversations,
            logicalEntities,
            diagrams,
            agents,
            tasks,
            events,
            orchestrationSessions,
            acpSessions,
            null);
    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
  }

  @Test
  void should_list_project_acp_sessions() {
    AcpSession running = session("101", "user-1", AcpSessionDescription.Status.RUNNING);
    AcpSession completed = session("102", "user-2", AcpSessionDescription.Status.COMPLETED);
    when(acpSessions.findAll()).thenReturn(new EntityList<>(running, completed));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/projects/{projectId}/sessions", project.getIdentity())
        .then()
        .statusCode(200)
        .contentType(startsWith(ResourceTypes.SESSION_COLLECTION))
        .body("_embedded.sessions", hasSize(2))
        .body("_embedded.sessions[0].id", is("101"))
        .body("_embedded.sessions[0].state", is("RUNNING"))
        .body("_embedded.sessions[0].project.id", is(project.getIdentity()))
        .body("_embedded.sessions[0].actor.id", is("user-1"))
        .body(
            "_embedded.sessions[0]._links.self.href",
            is("/api/projects/" + project.getIdentity() + "/sessions/101"))
        .body(
            "_links.self.href", is("/api/projects/" + project.getIdentity() + "/sessions?page=0"));
  }

  @Test
  void should_get_project_acp_session_by_id() {
    AcpSession running = session("201", "user-9", AcpSessionDescription.Status.RUNNING);
    when(acpSessions.findByIdentity("201")).thenReturn(Optional.of(running));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/projects/{projectId}/sessions/{sessionId}", project.getIdentity(), "201")
        .then()
        .statusCode(200)
        .contentType(startsWith(ResourceTypes.SESSION))
        .body("id", is("201"))
        .body("state", is("RUNNING"))
        .body("provider", is("team-ai"))
        .body("mode", is("CHAT"))
        .body("_links.self.href", is("/api/projects/" + project.getIdentity() + "/sessions/201"))
        .body("_links.collection.href", is("/api/projects/" + project.getIdentity() + "/sessions"));
  }

  @Test
  void should_return_404_when_session_does_not_exist() {
    when(acpSessions.findByIdentity("404")).thenReturn(Optional.empty());

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/projects/{projectId}/sessions/{sessionId}", project.getIdentity(), "404")
        .then()
        .statusCode(404);
  }

  private AcpSession session(
      String sessionId, String actorId, AcpSessionDescription.Status status) {
    return new AcpSession(
        sessionId,
        new AcpSessionDescription(
            new Ref<>(project.getIdentity()),
            new Ref<>(actorId),
            "team-ai",
            "CHAT",
            status,
            STARTED_AT,
            LAST_ACTIVITY_AT,
            status.isTerminal() ? COMPLETED_AT : null,
            status == AcpSessionDescription.Status.FAILED ? "runtime failed" : null,
            "evt-" + sessionId));
  }
}
