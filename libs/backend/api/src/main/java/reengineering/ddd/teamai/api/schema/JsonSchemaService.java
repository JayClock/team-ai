package reengineering.ddd.teamai.api.schema;

import com.fasterxml.jackson.databind.JsonNode;
import com.github.victools.jsonschema.generator.OptionPreset;
import com.github.victools.jsonschema.generator.SchemaGenerator;
import com.github.victools.jsonschema.generator.SchemaGeneratorConfig;
import com.github.victools.jsonschema.generator.SchemaGeneratorConfigBuilder;
import com.github.victools.jsonschema.generator.SchemaVersion;
import com.github.victools.jsonschema.module.jackson.JacksonModule;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

/** Service for generating and caching JSON Schema documents per Java type. */
@Service
public class JsonSchemaService {
  private final SchemaGenerator generator;
  private final Map<Class<?>, JsonNode> cache = new ConcurrentHashMap<>();

  public JsonSchemaService() {
    SchemaGeneratorConfigBuilder configBuilder =
        new SchemaGeneratorConfigBuilder(SchemaVersion.DRAFT_2019_09, OptionPreset.PLAIN_JSON);
    configBuilder.with(new JacksonModule());
    SchemaGeneratorConfig config = configBuilder.build();
    this.generator = new SchemaGenerator(config);
  }

  public JsonNode getSchemaFor(Class<?> type) {
    return cache.computeIfAbsent(type, generator::generateSchema);
  }
}
