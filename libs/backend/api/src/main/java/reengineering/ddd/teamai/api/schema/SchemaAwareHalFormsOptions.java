package reengineering.ddd.teamai.api.schema;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.hateoas.mediatype.hal.forms.HalFormsOptions;

/**
 * Internal HalFormsOptions wrapper that carries generated JSON Schema metadata for custom
 * serialization.
 */
final class SchemaAwareHalFormsOptions implements HalFormsOptions {
  private final HalFormsOptions delegate;
  private final JsonNode schema;

  private SchemaAwareHalFormsOptions(HalFormsOptions delegate, JsonNode schema) {
    this.delegate = delegate;
    this.schema = schema;
  }

  static SchemaAwareHalFormsOptions wrap(HalFormsOptions delegate, JsonNode schema) {
    return new SchemaAwareHalFormsOptions(delegate, schema);
  }

  static SchemaAwareHalFormsOptions schemaOnly(JsonNode schema) {
    return wrap(null, schema);
  }

  HalFormsOptions delegate() {
    return delegate;
  }

  JsonNode schema() {
    return schema;
  }

  @Override
  public String getPromptField() {
    return delegate != null ? delegate.getPromptField() : null;
  }

  @Override
  public String getValueField() {
    return delegate != null ? delegate.getValueField() : null;
  }

  @Override
  public Long getMinItems() {
    return delegate != null ? delegate.getMinItems() : null;
  }

  @Override
  public Long getMaxItems() {
    return delegate != null ? delegate.getMaxItems() : null;
  }

  @Override
  public Object getSelectedValue() {
    return delegate != null ? delegate.getSelectedValue() : null;
  }
}
