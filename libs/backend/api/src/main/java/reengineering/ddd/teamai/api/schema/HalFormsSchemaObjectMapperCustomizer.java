package reengineering.ddd.teamai.api.schema;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.BeanDescription;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationConfig;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.ser.BeanSerializerModifier;
import com.fasterxml.jackson.databind.util.TokenBuffer;
import java.io.IOException;
import java.lang.reflect.Field;
import java.util.function.Consumer;

/**
 * Adds "_schema" to HAL-FORMS property serialization when a property has been marked via {@link
 * WithJsonSchema}.
 */
final class HalFormsSchemaObjectMapperCustomizer implements Consumer<ObjectMapper> {
  private static final String HAL_FORMS_PROPERTY_CLASS_NAME =
      "org.springframework.hateoas.mediatype.hal.forms.HalFormsProperty";

  @Override
  public void accept(ObjectMapper objectMapper) {
    objectMapper.registerModule(
        new SimpleModule("hal-forms-json-schema")
            .setSerializerModifier(
                new BeanSerializerModifier() {
                  @Override
                  public JsonSerializer<?> modifySerializer(
                      SerializationConfig config,
                      BeanDescription beanDesc,
                      JsonSerializer<?> serializer) {
                    if (HAL_FORMS_PROPERTY_CLASS_NAME.equals(beanDesc.getBeanClass().getName())) {
                      return new HalFormsPropertySchemaSerializer(
                          serializer, beanDesc.getBeanClass());
                    }
                    return serializer;
                  }
                }));
  }

  private static final class HalFormsPropertySchemaSerializer extends JsonSerializer<Object> {
    private final JsonSerializer<Object> delegate;
    private final Field optionsField;

    @SuppressWarnings("unchecked")
    private HalFormsPropertySchemaSerializer(JsonSerializer<?> delegate, Class<?> halFormsClass) {
      this.delegate = (JsonSerializer<Object>) delegate;
      try {
        this.optionsField = halFormsClass.getDeclaredField("options");
        this.optionsField.setAccessible(true);
      } catch (NoSuchFieldException e) {
        throw new IllegalStateException("Unable to access HAL-FORMS options field", e);
      }
    }

    @Override
    public void serialize(Object value, JsonGenerator gen, SerializerProvider serializers)
        throws IOException {
      TokenBuffer buffer = new TokenBuffer(gen.getCodec(), false);
      delegate.serialize(value, buffer, serializers);

      JsonNode node;
      try (JsonParser parser = buffer.asParser()) {
        if (parser.nextToken() == null) {
          gen.writeNull();
          return;
        }
        node = gen.getCodec().readTree(parser);
      }

      if (node instanceof ObjectNode objectNode) {
        SchemaAwareHalFormsOptions schemaOptions = extractSchemaOptions(value);
        if (schemaOptions != null) {
          if (schemaOptions.delegate() == null) {
            objectNode.remove("options");
          }
          objectNode.set("_schema", schemaOptions.schema());
        }
      }

      gen.writeTree(node);
    }

    private SchemaAwareHalFormsOptions extractSchemaOptions(Object value) {
      try {
        Object options = optionsField.get(value);
        if (options instanceof SchemaAwareHalFormsOptions schemaOptions) {
          return schemaOptions;
        }
        return null;
      } catch (IllegalAccessException e) {
        throw new IllegalStateException("Unable to read HAL-FORMS options field", e);
      }
    }
  }
}
