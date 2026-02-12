package reengineering.ddd.teamai.api;

import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;
import static org.springframework.restdocs.operation.preprocess.Preprocessors.*;
import static org.springframework.restdocs.restassured.RestAssuredRestDocumentation.documentationConfiguration;

import io.restassured.RestAssured;
import io.restassured.builder.RequestSpecBuilder;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.restdocs.RestDocumentationContextProvider;
import org.springframework.restdocs.RestDocumentationExtension;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reengineering.ddd.teamai.api.config.TestApplication;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.Projects;
import reengineering.ddd.teamai.model.Users;

@SpringBootTest(webEnvironment = RANDOM_PORT, classes = TestApplication.class)
@ExtendWith(RestDocumentationExtension.class)
public class ApiTest {
  @MockitoBean protected Users users;
  @MockitoBean protected Projects projects;
  @MockitoBean protected Diagram.DomainArchitect domainArchitect;

  @Value("${local.server.port}")
  private int port;

  @Value("${server.servlet.context-path}")
  private String contextPath;

  protected RequestSpecification documentationSpec;

  @BeforeEach
  public void setup(RestDocumentationContextProvider restDocumentation) {
    RestAssured.port = port;
    RestAssured.basePath = contextPath;

    // Configure documentation spec with preprocessors
    this.documentationSpec =
        new RequestSpecBuilder()
            .addFilter(
                documentationConfiguration(restDocumentation)
                    .operationPreprocessors()
                    .withRequestDefaults(
                        modifyUris().scheme("https").host("api.team-ai.example.com").removePort(),
                        prettyPrint())
                    .withResponseDefaults(
                        removeHeaders(
                            "X-Content-Type-Options",
                            "X-XSS-Protection",
                            "Cache-Control",
                            "Pragma",
                            "Expires"),
                        prettyPrint()))
            .setPort(port)
            .setBasePath(contextPath)
            .build();
  }

  protected String uri(String path) {
    return String.format("http://localhost:%d%s", port, path);
  }
}
