package com.businessdrivenai.persistence.mybatis.cache;

/**
 * Association field configuration.
 *
 * @param fieldName field name in entity
 * @param associationType association implementation class
 * @param parentIdField parent ID field name
 * @param eager whether eager loading
 */
public record AssociationConfig(
    String fieldName, Class<?> associationType, String parentIdField, boolean eager) {}
