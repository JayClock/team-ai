package com.businessdrivenai.persistence.mybatis.mappers;

import com.businessdrivenai.domain.description.ProjectDescription;
import com.businessdrivenai.domain.model.Project;
import com.businessdrivenai.persistence.support.IdHolder;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserProjectsMapper {
  Project findProjectByUserAndId(@Param("user_id") int userId, @Param("id") int id);

  List<Project> findProjectsByUserId(
      @Param("user_id") int userId, @Param("from") int from, @Param("size") int size);

  int insertProject(
      @Param("holder") IdHolder holder,
      @Param("user_id") int userId,
      @Param("description") ProjectDescription description);

  void addMember(
      @Param("project_id") int projectId, @Param("user_id") int userId, @Param("role") String role);

  int countProjectsByUser(@Param("user_id") int userId);

  void deleteProject(@Param("user_id") int userId, @Param("id") int id);
}
