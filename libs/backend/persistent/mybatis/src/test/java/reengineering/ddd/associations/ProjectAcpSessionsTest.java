package reengineering.ddd.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.inject.Inject;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Import;
import reengineering.ddd.FlywayConfig;
import reengineering.ddd.TestCacheConfig;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.TestDataSetup;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AcpSessionDescription;
import reengineering.ddd.teamai.model.AcpSession;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
class ProjectAcpSessionsTest {
  @Inject private Users users;
  @Inject private CacheManager cacheManager;

  private Project project;

  @BeforeEach
  void setup() {
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    User user = users.findByIdentity("1").orElseThrow();
    project = user.projects().findAll().stream().findFirst().orElseThrow();
  }

  @Test
  void should_create_touch_and_complete_acp_session() {
    AcpSession created =
        project.startAcpSession(
            new AcpSessionDescription(
                new Ref<>(project.getIdentity()),
                new Ref<>("1"),
                "codex",
                "default",
                AcpSessionDescription.Status.PENDING,
                Instant.parse("2026-03-03T10:00:00Z"),
                Instant.parse("2026-03-03T10:00:00Z"),
                null,
                null,
                null,
                null));

    project.updateAcpSessionStatus(
        created.getIdentity(), AcpSessionDescription.Status.RUNNING, null, null);
    project.touchAcpSession(
        created.getIdentity(), Instant.parse("2026-03-03T10:01:00Z"), "evt-100");
    project.updateAcpSessionStatus(
        created.getIdentity(),
        AcpSessionDescription.Status.COMPLETED,
        Instant.parse("2026-03-03T10:03:00Z"),
        null);

    AcpSession loaded = project.acpSessions().findByIdentity(created.getIdentity()).orElseThrow();
    assertEquals(AcpSessionDescription.Status.COMPLETED, loaded.getDescription().status());
    assertEquals("evt-100", loaded.getDescription().lastEventId().id());
    assertEquals(Instant.parse("2026-03-03T10:03:00Z"), loaded.getDescription().completedAt());
  }

  @Test
  void should_list_sessions_by_project() {
    project.startAcpSession(
        new AcpSessionDescription(
            new Ref<>(project.getIdentity()),
            new Ref<>("1"),
            "codex",
            "default",
            AcpSessionDescription.Status.PENDING,
            Instant.parse("2026-03-03T11:00:00Z"),
            Instant.parse("2026-03-03T11:00:00Z"),
            null,
            null,
            null,
            null));
    project.startAcpSession(
        new AcpSessionDescription(
            new Ref<>(project.getIdentity()),
            new Ref<>("1"),
            "codex",
            "review",
            AcpSessionDescription.Status.PENDING,
            Instant.parse("2026-03-03T11:05:00Z"),
            Instant.parse("2026-03-03T11:05:00Z"),
            null,
            null,
            null,
            null));

    var list = project.findAcpSessions(project.getIdentity(), 0, 10);
    assertTrue(list.size() >= 2);
    assertNotNull(list.iterator().next().getDescription().provider());
  }

  @Test
  void should_persist_parent_session_id_for_child_session() {
    AcpSession parent =
        project.startAcpSession(
            new AcpSessionDescription(
                new Ref<>(project.getIdentity()),
                new Ref<>("1"),
                "codex",
                "default",
                AcpSessionDescription.Status.PENDING,
                Instant.parse("2026-03-03T12:00:00Z"),
                Instant.parse("2026-03-03T12:00:00Z"),
                null,
                null,
                null,
                null));

    AcpSession child =
        project.startAcpSession(
            new AcpSessionDescription(
                new Ref<>(project.getIdentity()),
                new Ref<>("1"),
                "codex",
                "default",
                AcpSessionDescription.Status.PENDING,
                Instant.parse("2026-03-03T12:01:00Z"),
                Instant.parse("2026-03-03T12:01:00Z"),
                null,
                null,
                null,
                new Ref<>(parent.getIdentity())));

    AcpSession loadedChild =
        project.acpSessions().findByIdentity(child.getIdentity()).orElseThrow();
    assertEquals(parent.getIdentity(), loadedChild.getDescription().parentSession().id());
  }
}
