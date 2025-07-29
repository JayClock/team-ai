package reengineering.ddd;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TestDataMapper {
  @Insert("INSERT INTO users(id, name, email) VALUES(#{id}, #{name}, #{email})")
  void insertUser(@Param("id") String id, @Param("name") String name, @Param("email") String email);
}
