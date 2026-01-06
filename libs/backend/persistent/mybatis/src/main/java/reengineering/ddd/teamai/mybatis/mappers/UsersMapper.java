package reengineering.ddd.teamai.mybatis.mappers;

import org.apache.ibatis.annotations.CacheNamespace;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.mybatis.caches.caffeine.CaffeineCache;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.User;

@Mapper
@CacheNamespace(implementation = CaffeineCache.class, readWrite = false)
public interface
UsersMapper {
  User findUserById(@Param("id") int id);

  int insertUser(@Param("holder") IdHolder id, @Param("description") UserDescription userDescription);
}
