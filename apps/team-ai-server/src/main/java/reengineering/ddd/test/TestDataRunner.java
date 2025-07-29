package reengineering.ddd.test;

import jakarta.inject.Inject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@Component
public class TestDataRunner implements CommandLineRunner {

  private final Logger logger = LoggerFactory.getLogger(TestDataRunner.class);


  private final TestDataMapper mapper;

  @Inject
  public TestDataRunner(TestDataMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  public void run(String... args) throws Exception {
    logger.info("Insert test data via MyBatis");

    String userId = "3";
    mapper.insertUser(userId, "Alice Johnson", "alice.johnson@email.com");
  }
}
