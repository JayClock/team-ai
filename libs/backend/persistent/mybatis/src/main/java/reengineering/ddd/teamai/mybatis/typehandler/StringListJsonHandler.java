package reengineering.ddd.teamai.mybatis.typehandler;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.List;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;

@MappedTypes(List.class)
public class StringListJsonHandler extends BaseTypeHandler<List<String>> {
  private static final ObjectMapper objectMapper = new ObjectMapper();
  private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

  @Override
  public void setNonNullParameter(
      PreparedStatement ps, int i, List<String> parameter, JdbcType jdbcType) throws SQLException {
    try {
      ps.setObject(i, objectMapper.writeValueAsString(parameter), Types.OTHER);
    } catch (JsonProcessingException e) {
      throw new SQLException("Failed to serialize string list", e);
    }
  }

  @Override
  public List<String> getNullableResult(ResultSet rs, String columnName) throws SQLException {
    return parse(rs.getString(columnName));
  }

  @Override
  public List<String> getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
    return parse(rs.getString(columnIndex));
  }

  @Override
  public List<String> getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
    return parse(cs.getString(columnIndex));
  }

  private List<String> parse(String json) throws SQLException {
    if (json == null || json.isBlank()) {
      return null;
    }
    try {
      return objectMapper.readValue(json, STRING_LIST);
    } catch (JsonProcessingException e) {
      throw new SQLException("Failed to deserialize string list", e);
    }
  }
}
