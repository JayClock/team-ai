package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.model.Context;
import reengineering.ddd.teamai.mybatis.mappers.ContextsMapper;

import java.util.List;

@Component
public class Contexts implements reengineering.ddd.teamai.model.Contexts {
  private final ContextsMapper mapper;

  @Inject
  public Contexts(ContextsMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  public List<Context> findAll() {
    return this.mapper.findContexts();
  }
}
