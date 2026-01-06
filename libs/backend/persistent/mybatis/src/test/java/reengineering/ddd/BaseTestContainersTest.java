package reengineering.ddd;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

public abstract class BaseTestContainersTest {

  private static final boolean CI_ENVIRONMENT = "true".equals(System.getenv("CI"));
  private static final PostgreSQLContainer<?> postgres;

  static {
    if (CI_ENVIRONMENT) {
      postgres = null;
      // In CI environment, PostgreSQL is provided by GitHub Actions services
      System.out.println("CI environment detected, using external PostgreSQL service");
    } else {
      postgres = new PostgreSQLContainer<>(DockerImageName.parse("postgres:15-alpine"))
        .withDatabaseName("testdb")
        .withUsername("test")
        .withPassword("test")
        .withReuse(true);
      postgres.start();
      System.out.println("TestContainers PostgreSQL started at: " + postgres.getJdbcUrl());
    }
  }

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    if (CI_ENVIRONMENT) {
      // Use GitHub Actions PostgreSQL service
      registry.add("spring.datasource.url", () -> "jdbc:postgresql://localhost:5432/testdb");
      registry.add("spring.datasource.username", () -> "test");
      registry.add("spring.datasource.password", () -> "test");
    } else {
      // Use TestContainers
      registry.add("spring.datasource.url", postgres::getJdbcUrl);
      registry.add("spring.datasource.username", postgres::getUsername);
      registry.add("spring.datasource.password", postgres::getPassword);
    }
  }
}
