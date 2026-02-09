package reengineering.ddd.teamai.mybatis.typehandler;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;
import reengineering.ddd.archtype.JsonBlob;

@MappedTypes(JsonBlob.class)
public class JsonBlobHandler extends BaseTypeHandler<JsonBlob> {
  private static final ObjectMapper objectMapper = new ObjectMapper();

  @Override
  public void setNonNullParameter(
      PreparedStatement ps, int i, JsonBlob parameter, JdbcType jdbcType) throws SQLException {
    ps.setObject(i, parameter.json(), Types.OTHER);
  }

  @Override
  public JsonBlob getNullableResult(ResultSet rs, String columnName) throws SQLException {
    String json = rs.getString(columnName);
    return parseJson(json);
  }

  @Override
  public JsonBlob getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
    String json = rs.getString(columnIndex);
    return parseJson(json);
  }

  @Override
  public JsonBlob getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
    String json = cs.getString(columnIndex);
    return parseJson(json);
  }

  private JsonBlob parseJson(String json) throws SQLException {
    if (json == null || json.isEmpty()) {
      return new JsonBlob("{}");
    }
    return new JsonBlob(json);
  }
}
