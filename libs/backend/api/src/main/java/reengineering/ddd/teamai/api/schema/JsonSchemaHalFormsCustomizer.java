package reengineering.ddd.teamai.api.schema;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.hateoas.AffordanceModel.PropertyMetadata;
import org.springframework.hateoas.mediatype.hal.forms.HalFormsConfiguration;
import org.springframework.hateoas.mediatype.hal.forms.HalFormsOptions;
import org.springframework.stereotype.Component;
import org.springframework.util.ClassUtils;
import reengineering.ddd.teamai.api.options.HalFormsOptionsCustomizer;

/**
 * Discovers {@link WithJsonSchema} on API input fields and injects generated schema payload into
 * HAL-FORMS properties.
 */
@Component
public class JsonSchemaHalFormsCustomizer implements HalFormsOptionsCustomizer {
  private static final String API_BASE_PACKAGE = "reengineering.ddd.teamai.api";

  private final JsonSchemaService schemaService;
  private final List<SchemaBinding> bindings;

  public JsonSchemaHalFormsCustomizer(JsonSchemaService schemaService, ObjectMapper objectMapper) {
    this.schemaService = schemaService;
    this.bindings = discoverBindings();
    new HalFormsSchemaObjectMapperCustomizer().accept(objectMapper);
  }

  @Override
  public HalFormsConfiguration customize(HalFormsConfiguration config) {
    HalFormsConfiguration result = config;

    for (SchemaBinding binding : bindings) {
      Function<PropertyMetadata, HalFormsOptions> existingOptionsCreator =
          findRegisteredOptionsCreator(result, binding.inputType(), binding.propertyName());

      result =
          result.withOptions(
              binding.inputType(),
              binding.propertyName(),
              metadata ->
                  SchemaAwareHalFormsOptions.wrap(
                      existingOptionsCreator != null
                          ? existingOptionsCreator.apply(metadata)
                          : null,
                      schemaService.getSchemaFor(binding.schemaType())));
    }

    return result;
  }

  private List<SchemaBinding> discoverBindings() {
    ClassPathScanningCandidateComponentProvider scanner =
        new ClassPathScanningCandidateComponentProvider(false);
    scanner.addIncludeFilter((metadataReader, metadataReaderFactory) -> true);

    List<SchemaBinding> discovered = new ArrayList<>();
    Set<String> visitedTypes = new HashSet<>();
    Set<String> deduplicatedBindings = new HashSet<>();

    for (BeanDefinition candidate : scanner.findCandidateComponents(API_BASE_PACKAGE)) {
      String className = candidate.getBeanClassName();
      if (className == null) {
        continue;
      }
      try {
        Class<?> type = ClassUtils.forName(className, ClassUtils.getDefaultClassLoader());
        collectBindings(type, discovered, visitedTypes, deduplicatedBindings);
      } catch (ClassNotFoundException e) {
        throw new IllegalStateException(
            "Failed to load class for schema scanning: " + className, e);
      }
    }

    return discovered.stream()
        .sorted(
            Comparator.comparing((SchemaBinding binding) -> binding.inputType().getName())
                .thenComparing(SchemaBinding::propertyName))
        .toList();
  }

  private void collectBindings(
      Class<?> type,
      List<SchemaBinding> discovered,
      Set<String> visitedTypes,
      Set<String> deduplicatedBindings) {
    if (!visitedTypes.add(type.getName())) {
      return;
    }

    for (Field field : type.getDeclaredFields()) {
      WithJsonSchema annotation = field.getAnnotation(WithJsonSchema.class);
      if (annotation == null) {
        continue;
      }
      String propertyName = resolvePropertyName(field);
      addBinding(
          discovered,
          deduplicatedBindings,
          new SchemaBinding(type, propertyName, annotation.value()));
    }

    if (type.isRecord()) {
      for (RecordComponent component : type.getRecordComponents()) {
        WithJsonSchema annotation = component.getAnnotation(WithJsonSchema.class);
        if (annotation == null) {
          continue;
        }
        String propertyName = resolvePropertyName(component);
        addBinding(
            discovered,
            deduplicatedBindings,
            new SchemaBinding(type, propertyName, annotation.value()));
      }
    }

    for (Class<?> nested : type.getDeclaredClasses()) {
      collectBindings(nested, discovered, visitedTypes, deduplicatedBindings);
    }
  }

  private void addBinding(
      List<SchemaBinding> discovered, Set<String> deduplicatedBindings, SchemaBinding binding) {
    String key = binding.inputType().getName() + "#" + binding.propertyName();
    if (deduplicatedBindings.add(key)) {
      discovered.add(binding);
    }
  }

  private String resolvePropertyName(Field field) {
    JsonProperty jsonProperty = field.getAnnotation(JsonProperty.class);
    if (jsonProperty != null && !jsonProperty.value().isBlank()) {
      return jsonProperty.value();
    }
    return field.getName();
  }

  private String resolvePropertyName(RecordComponent component) {
    JsonProperty jsonProperty = component.getAnnotation(JsonProperty.class);
    if (jsonProperty != null && !jsonProperty.value().isBlank()) {
      return jsonProperty.value();
    }
    return component.getName();
  }

  @SuppressWarnings("unchecked")
  private Function<PropertyMetadata, HalFormsOptions> findRegisteredOptionsCreator(
      HalFormsConfiguration config, Class<?> inputType, String propertyName) {
    try {
      Field optionsFactoryField = HalFormsConfiguration.class.getDeclaredField("options");
      optionsFactoryField.setAccessible(true);
      Object optionsFactory = optionsFactoryField.get(config);

      Field optionsField = optionsFactory.getClass().getDeclaredField("options");
      optionsField.setAccessible(true);

      Map<Class<?>, Map<String, Function<PropertyMetadata, HalFormsOptions>>> optionsByType =
          (Map<Class<?>, Map<String, Function<PropertyMetadata, HalFormsOptions>>>)
              optionsField.get(optionsFactory);

      Map<String, Function<PropertyMetadata, HalFormsOptions>> optionsByProperty =
          optionsByType.get(inputType);
      return optionsByProperty != null ? optionsByProperty.get(propertyName) : null;
    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException("Failed to inspect existing HAL-FORMS options", e);
    }
  }

  private record SchemaBinding(Class<?> inputType, String propertyName, Class<?> schemaType) {}
}
