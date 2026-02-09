package com.businessdrivenai.persistence.support;

import com.businessdrivenai.archtype.Ref;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;

@MappedTypes(Ref.class)
public class RefIntegerTypeHandler extends BaseTypeHandler<Ref<String>> {

  @Override
  public void setNonNullParameter(
      PreparedStatement ps, int i, Ref<String> parameter, JdbcType jdbcType) throws SQLException {
    if (parameter == null || parameter.id() == null) {
      ps.setNull(i, java.sql.Types.INTEGER);
    } else {
      ps.setInt(i, Integer.parseInt(parameter.id()));
    }
  }

  @Override
  public Ref<String> getNullableResult(ResultSet rs, String columnName) throws SQLException {
    Integer value = rs.getInt(columnName);
    if (rs.wasNull()) {
      return null;
    }
    return new Ref<>(String.valueOf(value));
  }

  @Override
  public Ref<String> getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
    Integer value = rs.getInt(columnIndex);
    if (rs.wasNull()) {
      return null;
    }
    return new Ref<>(String.valueOf(value));
  }

  @Override
  public Ref<String> getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
    Integer value = cs.getInt(columnIndex);
    if (cs.wasNull()) {
      return null;
    }
    return new Ref<>(String.valueOf(value));
  }
}
