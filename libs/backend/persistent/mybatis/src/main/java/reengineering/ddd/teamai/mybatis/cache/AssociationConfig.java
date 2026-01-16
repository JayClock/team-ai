package reengineering.ddd.teamai.mybatis.cache;

/**
 * Association 字段配置，用于水合时创建 association 对象。
 *
 * @param fieldName 实体中的字段名 (如 "accounts", "conversations")
 * @param associationType Association 实现类 (如 UserAccounts.class)
 * @param parentIdField Association 中的父 ID 字段名 (如 "userId")
 */
public record AssociationConfig(String fieldName, Class<?> associationType, String parentIdField) {}
