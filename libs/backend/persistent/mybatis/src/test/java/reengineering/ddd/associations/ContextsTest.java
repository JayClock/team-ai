package reengineering.ddd.associations;

import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reengineering.ddd.BaseTestContainersTest;
import reengineering.ddd.TestDataMapper;
import reengineering.ddd.teamai.model.Contexts;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class ContextsTest extends BaseTestContainersTest {
  @Inject
  Contexts contexts;

  @Test
  public void shouldFindContexts() {
    assertEquals(1, contexts.findAll().size());
  }
}
