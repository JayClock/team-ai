package reengineering.ddd.config;

import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@ComponentScan({"com.businessdrivenai.persistence.mybatis", "com.businessdrivenai.persistence"})
public class MyBatis {}
