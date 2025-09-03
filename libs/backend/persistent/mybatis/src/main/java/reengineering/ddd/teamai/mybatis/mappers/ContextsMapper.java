package reengineering.ddd.teamai.mybatis.mappers;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.teamai.model.Context;

import java.util.List;

@Mapper
public interface ContextsMapper {
  List<Context> findContexts();

  Context findContextById(@Param("id") int id);
}
