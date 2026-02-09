package com.businessdrivenai.persistence.mybatis.mappers;

import com.businessdrivenai.domain.model.Project;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ProjectsMapper {
  Project findProjectById(@Param("id") int id);
}
