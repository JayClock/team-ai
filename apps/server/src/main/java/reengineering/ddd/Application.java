package reengineering.ddd;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import reengineering.ddd.infrastructure.security.config.SecurityConfig;
import reengineering.ddd.infrastructure.security.oauth2.OAuth2UserService;

@SpringBootApplication(
    scanBasePackageClasses = {Application.class, SecurityConfig.class, OAuth2UserService.class})
public class Application {
  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }
}
