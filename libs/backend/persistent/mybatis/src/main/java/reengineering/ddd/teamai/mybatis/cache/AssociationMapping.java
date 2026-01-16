package reengineering.ddd.teamai.mybatis.cache;

import java.lang.annotation.*;

/** 标记 Association 类与 Entity 字段的映射关系。 替代硬编码的 REGISTRY Map，实现注解驱动的配置。 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface AssociationMapping {
  /** 目标实体类型 */
  Class<?> entity();

  /** 实体中的字段名 */
  String field();

  /** Association 中存储父 ID 的字段名 */
  String parentIdField();
}
