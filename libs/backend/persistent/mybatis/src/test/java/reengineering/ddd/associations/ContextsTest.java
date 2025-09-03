package reengineering.ddd.associations;

import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import reengineering.ddd.BaseTestContainersTest;
import reengineering.ddd.TestDataMapper;
import reengineering.ddd.teamai.model.Context;
import reengineering.ddd.teamai.model.Contexts;

import static org.junit.jupiter.api.Assertions.assertEquals;

@MybatisTest
public class ContextsTest extends BaseTestContainersTest {
  @Inject
  Contexts contexts;
  @Inject
  TestDataMapper mapper;

  @BeforeEach
  public void setUp() {
    mapper.insertContext(1, "title", "content");
  }

  @Test
  public void shouldFindContexts() {
    assertEquals(1, contexts.findAll().size());
  }

  @Test
  public void shouldFindContextsById() {
    Context context = contexts.findById("1").get();

    assertEquals("1", context.getIdentity());
    assertEquals("title", context.getDescription().title());
    assertEquals("content", context.getDescription().content());
  }
}
