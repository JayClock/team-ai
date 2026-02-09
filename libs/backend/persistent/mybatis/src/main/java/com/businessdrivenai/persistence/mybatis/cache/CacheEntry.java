package com.businessdrivenai.persistence.mybatis.cache;

import java.io.Serializable;
import java.util.List;
import java.util.Map;

/**
 * Generic cache entry storing entity's raw data (without association dependencies).
 *
 * @param entityType entity class type
 * @param identity entity ID
 * @param description entity description data
 * @param internalId internal ID (for rebuilding associations)
 * @param nestedCollections nested eager-loaded association data
 */
public record CacheEntry<ID, D>(
    Class<?> entityType,
    ID identity,
    D description,
    Object internalId,
    Map<String, List<CacheEntry<?, ?>>> nestedCollections)
    implements Serializable {

  private static final long serialVersionUID = 2L;
}
