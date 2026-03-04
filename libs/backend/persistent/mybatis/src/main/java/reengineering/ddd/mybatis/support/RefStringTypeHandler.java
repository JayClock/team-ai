package reengineering.ddd.mybatis.support;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;
import reengineering.ddd.archtype.Ref;

@MappedTypes(Ref.class)
public class RefStringTypeHandler extends BaseTypeHandler<Ref<String>> {

  @Override
  public void setNonNullParameter(
      PreparedStatement ps, int i, Ref<String> parameter, JdbcType jdbcType) throws SQLException {
    if (parameter == null || parameter.id() == null || parameter.id().isBlank()) {
      ps.setNull(i, java.sql.Types.VARCHAR);
      return;
    }
    ps.setString(i, parameter.id());
  }

  @Override
  public Ref<String> getNullableResult(ResultSet rs, String columnName) throws SQLException {
    String value = rs.getString(columnName);
    if (value == null || value.isBlank()) {
      return null;
    }
    return new Ref<>(value);
  }

  @Override
  public Ref<String> getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
    String value = rs.getString(columnIndex);
    if (value == null || value.isBlank()) {
      return null;
    }
    return new Ref<>(value);
  }

  @Override
  public Ref<String> getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
    String value = cs.getString(columnIndex);
    if (value == null || value.isBlank()) {
      return null;
    }
    return new Ref<>(value);
  }
}
