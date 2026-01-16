package reengineering.ddd.teamai.mybatis.cache;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.util.List;

/**
 * 缓存实体的反射元数据，避免重复反射查找。
 *
 * @param entityType 实体类型
 * @param constructor 用于创建实体的构造函数
 * @param associations Association 字段元数据列表
 */
public record EntityMetadata(
    Class<?> entityType, Constructor<?> constructor, List<AssociationFieldMeta> associations) {

  /**
   * Association 字段元数据。
   *
   * @param associationType Association 实现类
   * @param parentIdField 已缓存的父 ID 字段（可直接设置值）
   */
  public record AssociationFieldMeta(Class<?> associationType, Field parentIdField) {}
}
