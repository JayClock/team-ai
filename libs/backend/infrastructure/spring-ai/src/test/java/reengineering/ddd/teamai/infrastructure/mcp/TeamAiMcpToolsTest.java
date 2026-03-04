package reengineering.ddd.teamai.infrastructure.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Iterator;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.Many;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.AgentEvent;
import reengineering.ddd.teamai.model.Member;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Projects;
import reengineering.ddd.teamai.model.Task;

@ExtendWith(MockitoExtension.class)
class TeamAiMcpToolsTest {
  private static final String CURRENT_USER_ID = "u1";

  @Mock private Projects projects;
  @Mock private Project project;
  @Mock private Project.Members members;
  @Mock private Member member;
  @Mock private Project.Agents agents;
  @Mock private Project.Tasks tasks;
  @Mock private Project.AgentEvents events;

  private TeamAiMcpTools tools;

  @BeforeEach
  void setUp() {
    tools = new TeamAiMcpTools(projects);
    setCurrentUser(CURRENT_USER_ID);
    lenient().when(project.getIdentity()).thenReturn("p1");
    lenient().when(project.members()).thenReturn(members);
    lenient().when(members.findByIdentity(CURRENT_USER_ID)).thenReturn(Optional.of(member));
  }

  @AfterEach
  void tearDown() {
    RequestContextHolder.resetRequestAttributes();
  }

  @Test
  void should_list_projects() {
    Project p1 = mockProject("p1", "Alpha", CURRENT_USER_ID);
    Project p2 = mockProject("p2", "Beta", CURRENT_USER_ID);
    when(projects.findAll()).thenReturn(manyOf(p1, p2));

    List<TeamAiMcpTools.ProjectSummary> summaries = tools.listProjects();

    assertThat(summaries)
        .containsExactly(
            new TeamAiMcpTools.ProjectSummary("p1", "Alpha"),
            new TeamAiMcpTools.ProjectSummary("p2", "Beta"));
  }

  @Test
  void should_list_agents_in_project() {
    Agent routa =
        new Agent(
            "a1",
            new AgentDescription(
                "Routa Coordinator",
                AgentDescription.Role.ROUTA,
                "SMART",
                AgentDescription.Status.ACTIVE,
                null));
    Agent crafter =
        new Agent(
            "a2",
            new AgentDescription(
                "Crafter",
                AgentDescription.Role.CRAFTER,
                "SMART",
                AgentDescription.Status.PENDING,
                new Ref<>("a1")));

    when(projects.findByIdentity("p1")).thenReturn(Optional.of(project));
    when(project.agents()).thenReturn(agents);
    when(agents.findAll()).thenReturn(manyOf(routa, crafter));

    List<TeamAiMcpTools.AgentSummary> summaries = tools.listAgents("p1");

    assertThat(summaries)
        .containsExactly(
            new TeamAiMcpTools.AgentSummary(
                "a1", "Routa Coordinator", "ROUTA", "ACTIVE", "SMART", null),
            new TeamAiMcpTools.AgentSummary("a2", "Crafter", "CRAFTER", "PENDING", "SMART", "a1"));
  }

  @Test
  void should_create_agent_with_normalized_role_and_defaults() {
    when(projects.findByIdentity("p1")).thenReturn(Optional.of(project));
    when(project.createAgent(any()))
        .thenAnswer(
            invocation -> new Agent("a1", invocation.getArgument(0, AgentDescription.class)));

    TeamAiMcpTools.AgentSummary created =
        tools.createAgent("p1", "Implementation Agent", "crafter", null, "a-root");

    ArgumentCaptor<AgentDescription> captor = ArgumentCaptor.forClass(AgentDescription.class);
    verify(project).createAgent(captor.capture());
    AgentDescription description = captor.getValue();
    assertThat(description.role()).isEqualTo(AgentDescription.Role.CRAFTER);
    assertThat(description.status()).isEqualTo(AgentDescription.Status.PENDING);
    assertThat(description.modelTier()).isEqualTo("SMART");
    assertThat(description.parent()).isEqualTo(new Ref<>("a-root"));
    assertThat(created.id()).isEqualTo("a1");
    assertThat(created.role()).isEqualTo("CRAFTER");
  }

  @Test
  void should_create_task_with_pending_status_and_optional_fields() {
    when(projects.findByIdentity("p1")).thenReturn(Optional.of(project));
    when(project.createTask(any()))
        .thenAnswer(invocation -> new Task("t1", invocation.getArgument(0, TaskDescription.class)));

    TeamAiMcpTools.TaskSummary created =
        tools.createTask(
            "p1",
            "Build MCP",
            "Implement MCP endpoint",
            "backend",
            List.of("tests pass"),
            List.of("./gradlew :apps:server:test"));

    ArgumentCaptor<TaskDescription> captor = ArgumentCaptor.forClass(TaskDescription.class);
    verify(project).createTask(captor.capture());
    TaskDescription description = captor.getValue();
    assertThat(description.status()).isEqualTo(TaskDescription.Status.PENDING);
    assertThat(description.scope()).isEqualTo("backend");
    assertThat(description.acceptanceCriteria()).containsExactly("tests pass");
    assertThat(created.id()).isEqualTo("t1");
    assertThat(created.status()).isEqualTo("PENDING");
  }

  @Test
  void should_delegate_task_to_agent_and_return_reloaded_task() {
    when(projects.findByIdentity("p1")).thenReturn(Optional.of(project));
    Task delegated =
        new Task(
            "t1",
            new TaskDescription(
                "Build MCP",
                "Implement MCP endpoint",
                null,
                null,
                null,
                TaskDescription.Status.IN_PROGRESS,
                new Ref<>("a1"),
                new Ref<>("r1"),
                null,
                null,
                null));

    when(project.tasks()).thenReturn(tasks);
    when(tasks.findByIdentity("t1")).thenReturn(Optional.of(delegated));

    TeamAiMcpTools.TaskSummary summary = tools.delegateTaskToAgent("p1", "t1", "a1", "r1");

    ArgumentCaptor<Instant> instantCaptor = ArgumentCaptor.forClass(Instant.class);
    verify(project)
        .delegateTaskForExecution(eqTask("t1"), eqRef("a1"), eqRef("r1"), instantCaptor.capture());
    assertThat(instantCaptor.getValue()).isNotNull();
    assertThat(summary.status()).isEqualTo("IN_PROGRESS");
    assertThat(summary.assignedTo()).isEqualTo("a1");
    assertThat(summary.delegatedBy()).isEqualTo("r1");
  }

  @Test
  void should_submit_task_for_review_and_return_reloaded_task() {
    when(projects.findByIdentity("p1")).thenReturn(Optional.of(project));
    Task reviewed =
        new Task(
            "t1",
            new TaskDescription(
                "Build MCP",
                "Implement MCP endpoint",
                null,
                null,
                null,
                TaskDescription.Status.REVIEW_REQUIRED,
                new Ref<>("a1"),
                new Ref<>("r1"),
                "Done",
                null,
                null));

    when(project.tasks()).thenReturn(tasks);
    when(tasks.findByIdentity("t1")).thenReturn(Optional.of(reviewed));

    TeamAiMcpTools.TaskSummary summary =
        tools.submitTaskForReview("p1", "t1", "a1", "implementation finished");

    verify(project)
        .submitTaskForReview(
            eqTask("t1"), eqRef("a1"), eqString("implementation finished"), any(Instant.class));
    assertThat(summary.status()).isEqualTo("REVIEW_REQUIRED");
  }

  @Test
  void should_approve_task_and_return_completed_task() {
    when(projects.findByIdentity("p1")).thenReturn(Optional.of(project));
    Task approved =
        new Task(
            "t1",
            new TaskDescription(
                "Build MCP",
                "Implement MCP endpoint",
                null,
                null,
                null,
                TaskDescription.Status.COMPLETED,
                new Ref<>("a1"),
                new Ref<>("r1"),
                "Done",
                TaskDescription.VerificationVerdict.APPROVED,
                "verified"));

    when(project.tasks()).thenReturn(tasks);
    when(tasks.findByIdentity("t1")).thenReturn(Optional.of(approved));

    TeamAiMcpTools.TaskSummary summary = tools.approveTask("p1", "t1", "g1", "looks good");

    verify(project)
        .approveTask(eqTask("t1"), eqRef("g1"), eqString("looks good"), any(Instant.class));
    assertThat(summary.status()).isEqualTo("COMPLETED");
    assertThat(summary.verificationVerdict()).isEqualTo("APPROVED");
  }

  @Test
  void should_request_task_fix_and_return_needs_fix_task() {
    when(projects.findByIdentity("p1")).thenReturn(Optional.of(project));
    Task needsFix =
        new Task(
            "t1",
            new TaskDescription(
                "Build MCP",
                "Implement MCP endpoint",
                null,
                null,
                null,
                TaskDescription.Status.NEEDS_FIX,
                new Ref<>("a1"),
                new Ref<>("r1"),
                "Please adjust",
                TaskDescription.VerificationVerdict.NOT_APPROVED,
                "missing tests"));

    when(project.tasks()).thenReturn(tasks);
    when(tasks.findByIdentity("t1")).thenReturn(Optional.of(needsFix));

    TeamAiMcpTools.TaskSummary summary = tools.requestTaskFix("p1", "t1", "g1", "missing tests");

    verify(project)
        .requestTaskFix(eqTask("t1"), eqRef("g1"), eqString("missing tests"), any(Instant.class));
    assertThat(summary.status()).isEqualTo("NEEDS_FIX");
    assertThat(summary.verificationVerdict()).isEqualTo("NOT_APPROVED");
  }

  @Test
  void should_list_agent_events_sorted_by_newest_first_with_limit() {
    when(projects.findByIdentity("p1")).thenReturn(Optional.of(project));
    AgentEvent older =
        new AgentEvent(
            "e1",
            new AgentEventDescription(
                AgentEventDescription.Type.MESSAGE_SENT,
                new Ref<>("a1"),
                new Ref<>("t1"),
                "old",
                Instant.parse("2026-01-01T10:00:00Z")));
    AgentEvent newer =
        new AgentEvent(
            "e2",
            new AgentEventDescription(
                AgentEventDescription.Type.TASK_ASSIGNED,
                new Ref<>("a2"),
                new Ref<>("t2"),
                "new",
                Instant.parse("2026-01-01T11:00:00Z")));

    when(project.events()).thenReturn(events);
    when(events.findAll()).thenReturn(manyOf(older, newer));

    List<TeamAiMcpTools.AgentEventSummary> summaries = tools.listAgentEvents("p1", 1);

    assertThat(summaries).hasSize(1);
    assertThat(summaries.get(0).id()).isEqualTo("e2");
  }

  @Test
  void should_fail_when_project_is_blank_or_missing() {
    when(projects.findByIdentity("missing")).thenReturn(Optional.empty());

    assertThatThrownBy(() -> tools.listTasks(" "))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("projectId must not be blank");

    assertThatThrownBy(() -> tools.listTasks("missing"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Project not found: missing");
  }

  @Test
  void should_fail_when_authentication_is_missing() {
    RequestContextHolder.resetRequestAttributes();

    assertThatThrownBy(() -> tools.listProjects())
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Authentication required");
  }

  @Test
  void should_fail_when_user_is_not_project_member() {
    String outsider = "u-outsider";
    setCurrentUser(outsider);
    when(projects.findByIdentity("p1")).thenReturn(Optional.of(project));
    when(members.findByIdentity(outsider)).thenReturn(Optional.empty());

    assertThatThrownBy(() -> tools.listTasks("p1"))
        .isInstanceOf(SecurityException.class)
        .hasMessage("User u-outsider is not a member of project p1");
  }

  private static void setCurrentUser(String userId) {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setUserPrincipal(() -> userId);
    RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
  }

  private static Project mockProject(String id, String name, String memberUserId) {
    Project project = org.mockito.Mockito.mock(Project.class);
    Project.Members members = org.mockito.Mockito.mock(Project.Members.class);
    Member member = org.mockito.Mockito.mock(Member.class);
    when(project.getIdentity()).thenReturn(id);
    when(project.getDescription()).thenReturn(new ProjectDescription(name));
    when(project.members()).thenReturn(members);
    when(members.findByIdentity(memberUserId)).thenReturn(Optional.of(member));
    return project;
  }

  @SafeVarargs
  private static <E extends Entity<?, ?>> Many<E> manyOf(E... items) {
    return new TestMany<>(List.of(items));
  }

  private static String eqTask(String value) {
    return org.mockito.ArgumentMatchers.eq(value);
  }

  private static String eqString(String value) {
    return org.mockito.ArgumentMatchers.eq(value);
  }

  private static Ref<String> eqRef(String id) {
    return org.mockito.ArgumentMatchers.eq(new Ref<>(id));
  }

  private static final class TestMany<E extends Entity<?, ?>> implements Many<E> {
    private final List<E> values;

    private TestMany(List<E> values) {
      this.values = values;
    }

    @Override
    public int size() {
      return values.size();
    }

    @Override
    public Many<E> subCollection(int from, int to) {
      return new TestMany<>(values.subList(from, to));
    }

    @Override
    public Iterator<E> iterator() {
      return values.iterator();
    }
  }
}
