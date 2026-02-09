package com.businessdrivenai.persistence.mybatis.cache;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.util.List;

/**
 * Cached reflection metadata for entities, avoiding repeated reflection lookups.
 *
 * @param entityType entity class type
 * @param constructor constructor for creating entity instances
 * @param associations list of association field metadata
 */
public record EntityMetadata(
    Class<?> entityType, Constructor<?> constructor, List<AssociationFieldMeta> associations) {

  /**
   * Association field metadata.
   *
   * @param fieldName field name in entity
   * @param associationType association implementation class
   * @param parentIdField parent ID field
   * @param eager whether eager loading
   * @param listField list field of memory.EntityList (only used when eager=true)
   */
  public record AssociationFieldMeta(
      String fieldName,
      Class<?> associationType,
      Field parentIdField,
      boolean eager,
      Field listField) {}
}
