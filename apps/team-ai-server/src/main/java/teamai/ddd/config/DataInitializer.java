package teamai.ddd.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
public class DataInitializer {

    @Bean
    CommandLineRunner initDatabase(JdbcTemplate jdbcTemplate) {
        return args -> {
            // Insert test data
            jdbcTemplate.update("INSERT INTO users (id, name, email) VALUES (?, ?, ?)", 
                1, "John Smith", "john.smith@email.com");
            jdbcTemplate.update("INSERT INTO users (id, name, email) VALUES (?, ?, ?)", 
                2, "Jane Doe", "jane.doe@email.com");
            
            System.out.println("Test data inserted successfully!");
        };
    }
}
