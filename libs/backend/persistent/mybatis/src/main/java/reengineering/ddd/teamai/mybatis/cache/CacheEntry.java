package reengineering.ddd.teamai.mybatis.cache;

import java.io.Serializable;

/**
 * 通用缓存条目，存储实体的原始数据。 支持泛型 ID 类型（String、Long、UUID 等）。
 *
 * @param entityType 实体类型，用于水合时确定目标类
 * @param identity 泛型 ID，支持任意类型
 * @param description 实体描述数据
 * @param internalId 泛型内部 ID（可能是 int、long、String）
 */
public record CacheEntry<ID, D>(Class<?> entityType, ID identity, D description, Object internalId)
    implements Serializable {

  private static final long serialVersionUID = 1L;
}
