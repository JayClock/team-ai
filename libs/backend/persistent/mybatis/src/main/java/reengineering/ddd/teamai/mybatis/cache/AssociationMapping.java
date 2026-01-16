package reengineering.ddd.teamai.mybatis.cache;

import java.lang.annotation.*;

/** Marks the mapping between Association class and Entity field. */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface AssociationMapping {
  /** Target entity type */
  Class<?> entity();

  /** Field name in entity */
  String field();

  /** Parent ID field name in Association */
  String parentIdField();

  /**
   * Whether eager loading.
   *
   * <p>Eager associations use memory.EntityList with data passed at construction. Cache requires
   * recursive dehydration/hydration of nested entities.
   *
   * <p>Lazy associations use database.EntityList with data queried on demand. Cache only stores
   * parentId and rebuilds association on hydration.
   *
   * @return true for eager loading, false for lazy loading (default)
   */
  boolean eager() default false;
}
