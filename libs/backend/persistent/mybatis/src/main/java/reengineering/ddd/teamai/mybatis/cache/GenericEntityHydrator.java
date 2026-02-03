package reengineering.ddd.teamai.mybatis.cache;

import jakarta.annotation.PostConstruct;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.stereotype.Component;
import reengineering.ddd.archtype.Entity;
import reengineering.ddd.mybatis.support.InjectableObjectFactory;
import reengineering.ddd.teamai.model.Account;
import reengineering.ddd.teamai.model.Message;

@Component
public class GenericEntityHydrator {

  private static final String MEMORY_ENTITY_LIST_CLASS =
      "reengineering.ddd.mybatis.memory.EntityList";

  private final Supplier<InjectableObjectFactory> objectFactorySupplier;
  private final Map<Class<?>, EntityMetadata> metadataCache = new ConcurrentHashMap<>();
  private final Map<Class<?>, List<AssociationConfig>> registry = new ConcurrentHashMap<>();
  private final Set<Class<?>> entityTypes = ConcurrentHashMap.newKeySet();

  public GenericEntityHydrator(Supplier<InjectableObjectFactory> objectFactorySupplier) {
    this.objectFactorySupplier = objectFactorySupplier;
  }

  public GenericEntityHydrator(InjectableObjectFactory objectFactory) {
    this.objectFactorySupplier = () -> objectFactory;
  }

  @PostConstruct
  void scanAssociations() {
    ClassPathScanningCandidateComponentProvider scanner =
        new ClassPathScanningCandidateComponentProvider(false);
    scanner.addIncludeFilter(new AnnotationTypeFilter(AssociationMapping.class));

    Set<BeanDefinition> candidates =
        scanner.findCandidateComponents("reengineering.ddd.teamai.mybatis.associations");

    for (BeanDefinition bd : candidates) {
      try {
        Class<?> associationClass = Class.forName(bd.getBeanClassName());
        AssociationMapping mapping = associationClass.getAnnotation(AssociationMapping.class);

        if (mapping != null) {
          Class<?> entityType = mapping.entity();
          AssociationConfig config =
              new AssociationConfig(
                  mapping.field(), associationClass, mapping.parentIdField(), mapping.eager());

          registry.computeIfAbsent(entityType, k -> new ArrayList<>()).add(config);
          entityTypes.add(entityType);
        }
      } catch (ClassNotFoundException e) {
        throw new IllegalStateException(
            "Failed to load association class: " + bd.getBeanClassName(), e);
      }
    }

    registerLeafEntities();
  }

  private void registerLeafEntities() {
    entityTypes.add(Message.class);
    entityTypes.add(Account.class);
    registry.putIfAbsent(Message.class, List.of());
    registry.putIfAbsent(Account.class, List.of());
  }

  public boolean isEntity(Object value) {
    return value != null && entityTypes.contains(value.getClass());
  }

  public boolean isEntityList(Object value) {
    if (value instanceof List<?> list && !list.isEmpty()) {
      return isEntity(list.get(0));
    }
    return false;
  }

  public boolean isCacheEntry(Object value) {
    return value instanceof CacheEntry;
  }

  public boolean isCacheEntryList(Object value) {
    if (value instanceof List<?> list && !list.isEmpty()) {
      return list.get(0) instanceof CacheEntry;
    }
    return false;
  }

  public <E extends Entity<ID, D>, ID, D> CacheEntry<ID, D> extract(E entity) {
    Map<String, List<CacheEntry<?, ?>>> nestedCollections = extractNestedCollections(entity);

    return new CacheEntry<>(
        entity.getClass(),
        entity.getIdentity(),
        entity.getDescription(),
        parseInternalId(entity.getIdentity()),
        nestedCollections);
  }

  private Map<String, List<CacheEntry<?, ?>>> extractNestedCollections(Entity<?, ?> entity) {
    List<AssociationConfig> configs = registry.getOrDefault(entity.getClass(), List.of());
    Map<String, List<CacheEntry<?, ?>>> nestedCollections = new HashMap<>();

    for (AssociationConfig config : configs) {
      if (config.eager()) {
        try {
          Field field = entity.getClass().getDeclaredField(config.fieldName());
          field.setAccessible(true);
          Object association = field.get(entity);

          if (isMemoryEntityList(association)) {
            List<?> nestedEntities = extractListFromMemoryEntityList(association);
            List<CacheEntry<?, ?>> nestedEntries = new ArrayList<>();

            for (Object nestedEntity : nestedEntities) {
              if (nestedEntity instanceof Entity<?, ?> e) {
                nestedEntries.add(extract(e));
              }
            }

            nestedCollections.put(config.fieldName(), nestedEntries);
          }
        } catch (ReflectiveOperationException e) {
          throw new IllegalStateException(
              "Failed to extract nested collection: " + config.fieldName(), e);
        }
      }
    }

    return nestedCollections;
  }

  @SuppressWarnings({"unchecked", "rawtypes"})
  public List<CacheEntry<?, ?>> extractList(List<?> entities) {
    List result = new ArrayList<>();
    for (Object e : entities) {
      result.add(extract((Entity<?, ?>) e));
    }
    return result;
  }

  @SuppressWarnings("unchecked")
  public <E extends Entity<ID, D>, ID, D> E hydrate(CacheEntry<ID, D> entry) {
    Class<E> entityType = (Class<E>) entry.entityType();
    EntityMetadata metadata = getOrCreateMetadata(entityType);

    try {
      Object[] args = new Object[2 + metadata.associations().size()];
      args[0] = entry.identity();
      args[1] = entry.description();

      for (int i = 0; i < metadata.associations().size(); i++) {
        EntityMetadata.AssociationFieldMeta assocMeta = metadata.associations().get(i);

        if (assocMeta.eager()) {
          args[2 + i] = createEagerAssociation(assocMeta, entry.nestedCollections());
        } else {
          args[2 + i] = createLazyAssociation(assocMeta, entry.internalId());
        }
      }

      return (E) metadata.constructor().newInstance(args);
    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException("Failed to hydrate: " + entityType.getName(), e);
    }
  }

  @SuppressWarnings("unchecked")
  public <E extends Entity<?, ?>> List<E> hydrateList(List<?> entries) {
    return entries.stream().map(e -> (E) hydrate((CacheEntry<?, ?>) e)).toList();
  }

  @SuppressWarnings("unchecked")
  private Object createLazyAssociation(EntityMetadata.AssociationFieldMeta meta, Object parentId) {
    try {
      InjectableObjectFactory factory = objectFactorySupplier.get();
      Object association = factory.create((Class<Object>) meta.associationType());

      if (parentId instanceof Integer intId) {
        meta.parentIdField().setInt(association, intId);
      } else if (parentId instanceof Long longId) {
        meta.parentIdField().setLong(association, longId);
      } else {
        meta.parentIdField().set(association, parentId);
      }

      return association;
    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException("Failed to create lazy association", e);
    }
  }

  @SuppressWarnings("unchecked")
  private Object createEagerAssociation(
      EntityMetadata.AssociationFieldMeta meta,
      Map<String, List<CacheEntry<?, ?>>> nestedCollections) {
    try {
      InjectableObjectFactory factory = objectFactorySupplier.get();
      Object association = factory.create((Class<Object>) meta.associationType());

      List<CacheEntry<?, ?>> nestedEntries =
          nestedCollections.getOrDefault(meta.fieldName(), List.of());

      List<Object> hydratedEntities = new ArrayList<>();
      for (CacheEntry<?, ?> nestedEntry : nestedEntries) {
        hydratedEntities.add(hydrate(nestedEntry));
      }

      if (meta.listField() != null) {
        meta.listField().set(association, hydratedEntities);
      }

      return association;
    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException("Failed to create eager association", e);
    }
  }

  private EntityMetadata getOrCreateMetadata(Class<?> entityType) {
    return metadataCache.computeIfAbsent(entityType, this::buildMetadata);
  }

  private EntityMetadata buildMetadata(Class<?> entityType) {
    List<AssociationConfig> configs = registry.getOrDefault(entityType, List.of());

    try {
      // Sort configs by constructor parameter order to ensure correct hydration
      List<AssociationConfig> sortedConfigs = sortConfigsByConstructorOrder(entityType, configs);

      Class<?>[] paramTypes = new Class<?>[2 + sortedConfigs.size()];
      paramTypes[0] = String.class;
      paramTypes[1] = entityType.getMethod("getDescription").getReturnType();

      List<EntityMetadata.AssociationFieldMeta> assocMetas = new ArrayList<>();
      for (int i = 0; i < sortedConfigs.size(); i++) {
        AssociationConfig config = sortedConfigs.get(i);
        Field entityField = entityType.getDeclaredField(config.fieldName());
        paramTypes[2 + i] = entityField.getType();

        Field parentIdField = config.associationType().getDeclaredField(config.parentIdField());
        parentIdField.setAccessible(true);

        Field listField = null;
        if (config.eager()) {
          listField = findListField(config.associationType());
          if (listField != null) {
            listField.setAccessible(true);
          }
        }

        assocMetas.add(
            new EntityMetadata.AssociationFieldMeta(
                config.fieldName(),
                config.associationType(),
                parentIdField,
                config.eager(),
                listField));
      }

      Constructor<?> constructor = entityType.getConstructor(paramTypes);
      return new EntityMetadata(entityType, constructor, assocMetas);

    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException("Failed to build metadata for: " + entityType.getName(), e);
    }
  }

  /**
   * Sort association configs to match the constructor parameter order.
   *
   * <p>This is necessary because classpath scanning order is non-deterministic (depends on
   * filesystem order), but constructor parameters have a fixed order. Without sorting, hydration
   * would fail with wrong argument types or create incorrectly initialized objects.
   */
  private List<AssociationConfig> sortConfigsByConstructorOrder(
      Class<?> entityType, List<AssociationConfig> configs) throws NoSuchMethodException {
    if (configs.isEmpty()) {
      return configs;
    }

    Class<?> descriptionType = entityType.getMethod("getDescription").getReturnType();
    int expectedParamCount = 2 + configs.size();

    Constructor<?> targetConstructor = null;
    for (Constructor<?> ctor : entityType.getConstructors()) {
      if (ctor.getParameterCount() == expectedParamCount) {
        Class<?>[] paramTypes = ctor.getParameterTypes();
        if (paramTypes[0] == String.class && paramTypes[1] == descriptionType) {
          targetConstructor = ctor;
          break;
        }
      }
    }

    if (targetConstructor == null) {
      throw new NoSuchMethodException(
          "No matching constructor found for "
              + entityType.getName()
              + " with "
              + expectedParamCount
              + " parameters");
    }

    Map<Class<?>, AssociationConfig> configByFieldType = new HashMap<>();
    for (AssociationConfig config : configs) {
      try {
        Field field = entityType.getDeclaredField(config.fieldName());
        configByFieldType.put(field.getType(), config);
      } catch (NoSuchFieldException e) {
        throw new IllegalStateException("Field not found: " + config.fieldName(), e);
      }
    }

    List<AssociationConfig> sortedConfigs = new ArrayList<>();
    Class<?>[] paramTypes = targetConstructor.getParameterTypes();
    for (int i = 2; i < paramTypes.length; i++) {
      AssociationConfig config = configByFieldType.get(paramTypes[i]);
      if (config == null) {
        throw new IllegalStateException(
            "No association config found for parameter type: " + paramTypes[i].getName());
      }
      sortedConfigs.add(config);
    }

    return sortedConfigs;
  }

  private boolean isMemoryEntityList(Object obj) {
    if (obj == null) return false;

    Class<?> clazz = obj.getClass();
    while (clazz != null) {
      if (clazz.getName().equals(MEMORY_ENTITY_LIST_CLASS)) {
        return true;
      }
      clazz = clazz.getSuperclass();
    }
    return false;
  }

  @SuppressWarnings("unchecked")
  private List<?> extractListFromMemoryEntityList(Object memoryEntityList) {
    try {
      Field listField = findListField(memoryEntityList.getClass());
      if (listField != null) {
        listField.setAccessible(true);
        return (List<?>) listField.get(memoryEntityList);
      }
      return List.of();
    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException("Failed to extract list from memory.EntityList", e);
    }
  }

  private Field findListField(Class<?> clazz) {
    Class<?> current = clazz;
    while (current != null) {
      try {
        return current.getDeclaredField("list");
      } catch (NoSuchFieldException e) {
        current = current.getSuperclass();
      }
    }
    return null;
  }

  private Object parseInternalId(Object identity) {
    if (identity instanceof String strId) {
      try {
        return Integer.parseInt(strId);
      } catch (NumberFormatException e) {
        return strId;
      }
    }
    return identity;
  }
}
