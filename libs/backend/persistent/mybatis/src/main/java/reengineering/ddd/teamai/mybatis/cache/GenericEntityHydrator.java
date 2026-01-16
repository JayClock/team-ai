package reengineering.ddd.teamai.mybatis.cache;

import jakarta.annotation.PostConstruct;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.util.ArrayList;
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
              new AssociationConfig(mapping.field(), associationClass, mapping.parentIdField());

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
    return new CacheEntry<>(
        entity.getClass(),
        entity.getIdentity(),
        entity.getDescription(),
        parseInternalId(entity.getIdentity()));
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
        args[2 + i] = createAssociation(assocMeta, entry.internalId());
      }

      return (E) metadata.constructor().newInstance(args);
    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException("Failed to hydrate: " + entityType.getName(), e);
    }
  }

  /** 批量水合：List<CacheEntry> → List<Entity> */
  @SuppressWarnings("unchecked")
  public <E extends Entity<?, ?>> List<E> hydrateList(List<?> entries) {
    return entries.stream().map(e -> (E) hydrate((CacheEntry<?, ?>) e)).toList();
  }

  private EntityMetadata getOrCreateMetadata(Class<?> entityType) {
    return metadataCache.computeIfAbsent(entityType, this::buildMetadata);
  }

  private EntityMetadata buildMetadata(Class<?> entityType) {
    List<AssociationConfig> configs = registry.getOrDefault(entityType, List.of());

    try {
      Class<?>[] paramTypes = new Class<?>[2 + configs.size()];
      paramTypes[0] = String.class;
      paramTypes[1] = entityType.getMethod("getDescription").getReturnType();

      List<EntityMetadata.AssociationFieldMeta> assocMetas = new ArrayList<>();
      for (int i = 0; i < configs.size(); i++) {
        AssociationConfig config = configs.get(i);
        Field entityField = entityType.getDeclaredField(config.fieldName());
        paramTypes[2 + i] = entityField.getType();

        Field parentIdField = config.associationType().getDeclaredField(config.parentIdField());
        parentIdField.setAccessible(true);

        assocMetas.add(
            new EntityMetadata.AssociationFieldMeta(config.associationType(), parentIdField));
      }

      Constructor<?> constructor = entityType.getConstructor(paramTypes);
      return new EntityMetadata(entityType, constructor, assocMetas);

    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException("Failed to build metadata for: " + entityType.getName(), e);
    }
  }

  @SuppressWarnings("unchecked")
  private Object createAssociation(EntityMetadata.AssociationFieldMeta meta, Object parentId) {
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
      throw new IllegalStateException("Failed to create association", e);
    }
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
