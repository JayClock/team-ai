package com.businessdrivenai.persistence.mybatis.typehandler;

import com.businessdrivenai.domain.description.EdgeStyleProps;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;

@MappedTypes(EdgeStyleProps.class)
public class EdgeStylePropsHandler extends BaseTypeHandler<EdgeStyleProps> {
  private static final ObjectMapper objectMapper = new ObjectMapper();

  @Override
  public void setNonNullParameter(
      PreparedStatement ps, int i, EdgeStyleProps parameter, JdbcType jdbcType)
      throws SQLException {
    try {
      ps.setObject(i, objectMapper.writeValueAsString(parameter), Types.OTHER);
    } catch (Exception e) {
      throw new SQLException("Failed to serialize EdgeStyleProps", e);
    }
  }

  @Override
  public EdgeStyleProps getNullableResult(ResultSet rs, String columnName) throws SQLException {
    String json = rs.getString(columnName);
    return parseJson(json);
  }

  @Override
  public EdgeStyleProps getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
    String json = rs.getString(columnIndex);
    return parseJson(json);
  }

  @Override
  public EdgeStyleProps getNullableResult(CallableStatement cs, int columnIndex)
      throws SQLException {
    String json = cs.getString(columnIndex);
    return parseJson(json);
  }

  private EdgeStyleProps parseJson(String json) throws SQLException {
    if (json == null || json.isEmpty()) {
      return new EdgeStyleProps(null, null, null, null);
    }
    try {
      return objectMapper.readValue(json, EdgeStyleProps.class);
    } catch (Exception e) {
      throw new SQLException("Failed to parse EdgeStyleProps: " + json, e);
    }
  }
}
