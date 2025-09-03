package reengineering.ddd.teamai.api;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reengineering.ddd.teamai.description.ContextDescription;
import reengineering.ddd.teamai.model.Context;
import reengineering.ddd.teamai.model.Contexts;

import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.mockito.Mockito.when;

public class ContextsApiTest extends ApiTest {
  @MockitoBean
  private Contexts contexts;

  @Test
  public void should_return_contexts() {
    ContextDescription description = new ContextDescription("title", "content");
    Context context = new Context("context_1", description);
    when(contexts.findAll()).thenReturn(List.of(context));
    given()
      .when().get("/contexts")
      .then().statusCode(200)
      .body("_embedded.contexts.size()", is(1))
      .body("_embedded.contexts[0].id", is(context.getIdentity()))
      .body("_embedded.contexts[0].title", is(description.title()))
      .body("_embedded.contexts[0].content", is(description.content()));
  }
}
