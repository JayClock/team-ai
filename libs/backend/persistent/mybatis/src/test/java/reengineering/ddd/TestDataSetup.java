package reengineering.ddd;

import org.junit.jupiter.api.extension.BeforeAllCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Users;

public class TestDataSetup implements BeforeAllCallback {
  @Override
  public void beforeAll(ExtensionContext context) throws Exception {
    ApplicationContext springContext = SpringExtension.getApplicationContext(context);
    Users users = springContext.getBean(Users.class);
    users.createUser(new UserDescription("John Smith", "john.smith@email.com"));
  }
}
