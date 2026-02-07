package reengineering.ddd.teamai.mybatis.typehandler;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;
import reengineering.ddd.teamai.description.EdgeRelationType;

/**
 * MyBatis TypeHandler for EdgeRelationType enum. Converts between EdgeRelationType enum and its
 * string value for database storage.
 */
@MappedTypes(EdgeRelationType.class)
public class EdgeRelationTypeHandler extends BaseTypeHandler<EdgeRelationType> {

  @Override
  public void setNonNullParameter(
      PreparedStatement ps, int i, EdgeRelationType parameter, JdbcType jdbcType)
      throws SQLException {
    ps.setString(i, parameter.getValue());
  }

  @Override
  public EdgeRelationType getNullableResult(ResultSet rs, String columnName) throws SQLException {
    String value = rs.getString(columnName);
    return value == null ? null : EdgeRelationType.fromValue(value);
  }

  @Override
  public EdgeRelationType getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
    String value = rs.getString(columnIndex);
    return value == null ? null : EdgeRelationType.fromValue(value);
  }

  @Override
  public EdgeRelationType getNullableResult(CallableStatement cs, int columnIndex)
      throws SQLException {
    String value = cs.getString(columnIndex);
    return value == null ? null : EdgeRelationType.fromValue(value);
  }
}
