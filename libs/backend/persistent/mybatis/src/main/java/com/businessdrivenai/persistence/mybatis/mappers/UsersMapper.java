package com.businessdrivenai.persistence.mybatis.mappers;

import com.businessdrivenai.domain.description.UserDescription;
import com.businessdrivenai.domain.model.User;
import com.businessdrivenai.persistence.support.IdHolder;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UsersMapper {
  User findUserById(@Param("id") int id);

  int insertUser(
      @Param("holder") IdHolder id, @Param("description") UserDescription userDescription);

  int updateUser(@Param("id") int id, @Param("request") User.UserChange request);
}
