package reengineering.ddd.teamai.mybatis.mappers;

import org.apache.ibatis.annotations.Mapper;
import reengineering.ddd.teamai.model.Context;

import java.util.List;

@Mapper
public interface ContextsMapper {
  List<Context> findContexts();
}
