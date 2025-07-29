package reengineering.ddd.config;

import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@ComponentScan({"teamai.ddd.mappers", "teamai.ddd.support", "teamai.ddd.associations"})
public class MyBatis {
}
