package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.KnowledgeGraph;
import reengineering.ddd.teamai.model.Project;

public class KnowledgeGraphApiTest extends ApiTest {
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
  public void should_return_project_knowledge_graph() {
    KnowledgeGraph graph =
        new KnowledgeGraph(
            project.getIdentity(),
            List.of(
                new KnowledgeGraph.Node(
                    "101",
                    "EVIDENCE",
                    "contract",
                    "OrderContract",
                    "订单合同",
                    "{\"description\":\"合同\"}"),
                new KnowledgeGraph.Node(
                    "102",
                    "EVIDENCE",
                    "fulfillment_request",
                    "CreatePayment",
                    "创建支付",
                    "{\"description\":\"发起支付\"}")),
            List.of(new KnowledgeGraph.Edge("1", "101", "102", "AUTHORIZES")));
    when(knowledgeGraphReader.readProjectKnowledgeGraph(project.getIdentity())).thenReturn(graph);

    given(documentationSpec)
        .when()
        .get("/projects/{projectId}/knowledge-graph", project.getIdentity())
        .then()
        .statusCode(200)
        .contentType(startsWith(ResourceTypes.KNOWLEDGE_GRAPH))
        .body("projectId", is(project.getIdentity()))
        .body("nodes", hasSize(2))
        .body("nodes[0].logicalEntityId", is("101"))
        .body("edges", hasSize(1))
        .body("edges[0].relationType", is("AUTHORIZES"))
        .body("_links.self.href", is("/api/projects/" + project.getIdentity() + "/knowledge-graph"))
        .body("_links.project.href", is("/api/projects/" + project.getIdentity()));
  }
}
