package reengineering.ddd.teamai.mybatis.typehandler;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import org.junit.jupiter.api.Test;
import reengineering.ddd.teamai.description.ParticipantSubType;

class SubTypeHandlerTest {

  @Test
  void should_parse_sub_type_with_case_insensitive_prefix_and_value() throws Exception {
    SubTypeHandler handler = new SubTypeHandler();
    ResultSet rs = mock(ResultSet.class);
    when(rs.getString("le_sub_type")).thenReturn("participant:PARTY");

    assertEquals(ParticipantSubType.PARTY, handler.getNullableResult(rs, "le_sub_type"));
  }

  @Test
  void should_reject_invalid_sub_type_format() throws Exception {
    SubTypeHandler handler = new SubTypeHandler();
    ResultSet rs = mock(ResultSet.class);
    when(rs.getString("le_sub_type")).thenReturn("PARTY");

    assertThrows(
        IllegalArgumentException.class, () -> handler.getNullableResult(rs, "le_sub_type"));
  }
}
