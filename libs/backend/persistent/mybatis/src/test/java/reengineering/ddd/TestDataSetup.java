package reengineering.ddd;

import org.junit.jupiter.api.extension.BeforeAllCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.junit.jupiter.SpringExtension;

public class TestDataSetup implements BeforeAllCallback {
  @Override
  public void beforeAll(ExtensionContext context) throws Exception {
    ApplicationContext springContext = SpringExtension.getApplicationContext(context);
    TestDataMapper testData = springContext.getBean(TestDataMapper.class);
    testData.insertUser("1", "John Smith", "john.smith@email.com");
  }
}
