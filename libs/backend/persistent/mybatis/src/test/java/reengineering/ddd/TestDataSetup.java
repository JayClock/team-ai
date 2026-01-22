package reengineering.ddd;

import org.junit.jupiter.api.extension.BeforeAllCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.description.BizDiagramDescription;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;

public class TestDataSetup implements BeforeAllCallback, ExtensionContext.Store.CloseableResource {
  private static final String GLOBAL_KEY = "my_custom_db_init_flag";

  @Override
  public void beforeAll(ExtensionContext context) throws Exception {
    ExtensionContext.Store globalStore =
        context.getRoot().getStore(ExtensionContext.Namespace.GLOBAL);

    globalStore.getOrComputeIfAbsent(
        GLOBAL_KEY,
        key -> {
          ApplicationContext springContext = SpringExtension.getApplicationContext(context);
          TestDataMapper testData = springContext.getBean(TestDataMapper.class);
          Users users = springContext.getBean(Users.class);

          int userId = 1;
          testData.insertUser(userId, "John Smith", "john.smith@email.com");

          User user = users.findById(String.valueOf(userId)).get();

          for (var project = 0; project < 5; project++) {
            var description = new ProjectDescription("name", "model");
            user.add(description);
          }

          Project project = user.projects().findAll().stream().findFirst().get();

          for (var conversation = 0; conversation < 100; conversation++) {
            var description = new ConversationDescription("title");
            project.add(description);
          }

          Conversation conversation = project.conversations().findAll().stream().findFirst().get();

          for (var i = 0; i < 100; i++) {
            var description = new MessageDescription("role", "content");
            conversation.saveMessage(description);
          }

          for (var i = 0; i < 100; i++) {
            var description =
                new BizDiagramDescription(
                    "Diagram " + i,
                    "Description " + i,
                    "@startuml\ndiagram " + i + "\n@enduml",
                    "flowchart");
            project.addBizDiagram(description);
          }

          user.add(new AccountDescription("github", "github01"));
          return this;
        });
  }

  @Override
  public void close() throws Throwable {
    System.out.println(">>> All tests completed, cleaning up resources...");
  }
}
