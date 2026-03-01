package reengineering.ddd.teamai.mybatis.cache;

import jakarta.annotation.PostConstruct;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Arrays;
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
import reengineering.ddd.archtype.HasOne;
import reengineering.ddd.mybatis.memory.Reference;
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
    EntityMetadata metadata = getOrCreateMetadata(entity.getClass());
    Map<String, List<CacheEntry<?, ?>>> nestedCollections = new HashMap<>();

    for (EntityMetadata.AssociationFieldMeta meta : metadata.associations()) {
      try {
        Field field = entity.getClass().getDeclaredField(meta.fieldName());
        field.setAccessible(true);
        Object association = field.get(entity);

        if (meta.hasOne()) {
          List<CacheEntry<?, ?>> nestedEntries = new ArrayList<>();
          if (association instanceof HasOne<?> hasOne) {
            Object nestedEntity = hasOne.get();
            if (nestedEntity instanceof Entity<?, ?> nested) {
              nestedEntries.add(extract(nested));
            }
          }
          nestedCollections.put(meta.fieldName(), nestedEntries);
          continue;
        }

        if (meta.eager() && isMemoryEntityList(association)) {
          List<?> nestedEntities = extractListFromMemoryEntityList(association);
          List<CacheEntry<?, ?>> nestedEntries = new ArrayList<>();

          for (Object nestedEntity : nestedEntities) {
            if (nestedEntity instanceof Entity<?, ?> nested) {
              nestedEntries.add(extract(nested));
            }
          }

          nestedCollections.put(meta.fieldName(), nestedEntries);
        }
      } catch (ReflectiveOperationException e) {
        throw new IllegalStateException(
            "Failed to extract nested collection: " + meta.fieldName(), e);
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

        if (assocMeta.hasOne()) {
          args[2 + i] = createHasOneAssociation(assocMeta, entry.nestedCollections());
        } else if (assocMeta.eager()) {
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

  @SuppressWarnings("unchecked")
  private Object createHasOneAssociation(
      EntityMetadata.AssociationFieldMeta meta,
      Map<String, List<CacheEntry<?, ?>>> nestedCollections) {
    try {
      InjectableObjectFactory factory = objectFactorySupplier.get();
      Object association = factory.create((Class<Object>) meta.associationType());
      List<CacheEntry<?, ?>> nestedEntries =
          nestedCollections.getOrDefault(meta.fieldName(), List.of());
      if (!nestedEntries.isEmpty() && meta.hasOneEntityField() != null) {
        Object entity = hydrate(nestedEntries.get(0));
        meta.hasOneEntityField().set(association, entity);
      }
      return association;
    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException("Failed to create has-one association", e);
    }
  }

  private EntityMetadata getOrCreateMetadata(Class<?> entityType) {
    return metadataCache.computeIfAbsent(entityType, this::buildMetadata);
  }

  private EntityMetadata buildMetadata(Class<?> entityType) {
    List<AssociationConfig> configs = registry.getOrDefault(entityType, List.of());
    Map<String, AssociationConfig> configByFieldName = new HashMap<>();
    for (AssociationConfig config : configs) {
      configByFieldName.put(config.fieldName(), config);
    }

    try {
      Class<?> descriptionType = entityType.getMethod("getDescription").getReturnType();
      Constructor<?> constructor = findTargetConstructor(entityType, descriptionType);
      List<Field> constructorAssociationFields =
          resolveConstructorAssociationFields(entityType, constructor);

      List<EntityMetadata.AssociationFieldMeta> assocMetas = new ArrayList<>();
      for (Field entityField : constructorAssociationFields) {
        AssociationConfig config = configByFieldName.get(entityField.getName());
        if (config != null) {
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
                  listField,
                  false,
                  null));
          continue;
        }

        if (HasOne.class.isAssignableFrom(entityField.getType())) {
          Field hasOneEntityField = Reference.class.getDeclaredField("entity");
          hasOneEntityField.setAccessible(true);
          assocMetas.add(
              new EntityMetadata.AssociationFieldMeta(
                  entityField.getName(),
                  Reference.class,
                  null,
                  true,
                  null,
                  true,
                  hasOneEntityField));
          continue;
        }

        throw new IllegalStateException(
            "No association mapping found for constructor field: "
                + entityType.getName()
                + "."
                + entityField.getName());
      }

      return new EntityMetadata(entityType, constructor, assocMetas);

    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException("Failed to build metadata for: " + entityType.getName(), e);
    }
  }

  private Constructor<?> findTargetConstructor(Class<?> entityType, Class<?> descriptionType)
      throws NoSuchMethodException {
    Constructor<?> targetConstructor = null;
    for (Constructor<?> ctor : entityType.getConstructors()) {
      Class<?>[] paramTypes = ctor.getParameterTypes();
      if (paramTypes.length >= 2
          && paramTypes[0] == String.class
          && paramTypes[1] == descriptionType) {
        if (targetConstructor == null
            || ctor.getParameterCount() > targetConstructor.getParameterCount()) {
          targetConstructor = ctor;
        }
      }
    }
    if (targetConstructor == null) {
      throw new NoSuchMethodException(
          "No matching constructor found for "
              + entityType.getName()
              + " with identity and description parameters");
    }
    return targetConstructor;
  }

  private List<Field> resolveConstructorAssociationFields(
      Class<?> entityType, Constructor<?> constructor) {
    Class<?>[] paramTypes = constructor.getParameterTypes();
    if (paramTypes.length <= 2) {
      return List.of();
    }

    List<Field> candidateFields =
        Arrays.stream(entityType.getDeclaredFields())
            .filter(field -> !Modifier.isStatic(field.getModifiers()))
            .filter(field -> !field.isSynthetic())
            .filter(field -> !"identity".equals(field.getName()))
            .filter(field -> !"description".equals(field.getName()))
            .toList();

    boolean[] used = new boolean[candidateFields.size()];
    List<Field> orderedFields = new ArrayList<>();

    for (int paramIndex = 2; paramIndex < paramTypes.length; paramIndex++) {
      Class<?> paramType = paramTypes[paramIndex];
      int matchedFieldIndex = -1;
      for (int fieldIndex = 0; fieldIndex < candidateFields.size(); fieldIndex++) {
        if (!used[fieldIndex] && candidateFields.get(fieldIndex).getType() == paramType) {
          matchedFieldIndex = fieldIndex;
          break;
        }
      }

      if (matchedFieldIndex < 0) {
        throw new IllegalStateException(
            "Cannot match constructor parameter type "
                + paramType.getName()
                + " for entity "
                + entityType.getName());
      }

      used[matchedFieldIndex] = true;
      orderedFields.add(candidateFields.get(matchedFieldIndex));
    }

    return orderedFields;
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
