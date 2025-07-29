package teamai.ddd.api;

import io.restassured.RestAssured;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import teamai.ddd.api.config.TestApplication;

import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

@SpringBootTest(webEnvironment = RANDOM_PORT, classes = TestApplication.class)
public class ApiTest {
    @Value("${local.server.port}")
    private int port;
    @Value("${server.servlet.context-path}")
    private String contextPath;

    @BeforeEach
    public void setup() {
        RestAssured.port = port;
        RestAssured.basePath = contextPath;
    }

    protected String uri(String path) {
        return String.format("http://localhost:%d%s", port, path);
    }
}

