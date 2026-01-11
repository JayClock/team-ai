package reengineering.ddd.config;

import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@ComponentScan({"reengineering.ddd.teamai.mybatis", "reengineering.ddd.mybatis.support"})
public class MyBatis {}
