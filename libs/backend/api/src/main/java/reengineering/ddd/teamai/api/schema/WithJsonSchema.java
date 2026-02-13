package reengineering.ddd.teamai.api.schema;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a HAL-FORMS input property that should expose a generated JSON Schema via the "_schema"
 * attribute.
 */
@Target({ElementType.FIELD, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
public @interface WithJsonSchema {
  /**
   * Type used to generate the JSON Schema payload.
   *
   * <p>This is explicit to avoid Java type-erasure issues for generic properties.
   */
  Class<?> value();
}
