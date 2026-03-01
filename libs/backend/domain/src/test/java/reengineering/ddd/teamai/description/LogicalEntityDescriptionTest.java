package reengineering.ddd.teamai.description;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;
import reengineering.ddd.teamai.description.LogicalEntityDescription.Type;

public class LogicalEntityDescriptionTest {
  @Test
  public void should_create_entity_description() {
    EntityDefinition definition =
        new EntityDefinition("Test description", List.of("tag1", "tag2"), List.of(), List.of());

    LogicalEntityDescription description =
        new LogicalEntityDescription(
            Type.EVIDENCE, EvidenceSubType.REQUEST_FOR_PROPOSAL, "Order", "订单", definition);

    assertEquals(Type.EVIDENCE, description.type());
    assertEquals(EvidenceSubType.REQUEST_FOR_PROPOSAL, description.subType());
    assertEquals("Order", description.name());
    assertEquals("订单", description.label());
    assertEquals(definition, description.definition());
  }

  @Test
  public void should_create_entity_attribute() {
    EntityAttribute attribute =
        new EntityAttribute("attr-1", "orderId", "订单编号", "UUID", "全局唯一标识", true, false, "public");

    assertEquals("attr-1", attribute.id());
    assertEquals("orderId", attribute.name());
    assertEquals("订单编号", attribute.label());
    assertEquals("UUID", attribute.type());
    assertEquals("全局唯一标识", attribute.description());
    assertTrue(attribute.isBusinessKey());
    assertFalse(attribute.relation());
    assertEquals("public", attribute.visibility());
  }

  @Test
  public void should_create_entity_behavior() {
    EntityBehavior behavior = new EntityBehavior("m-1", "pay()", "支付", "触发支付流程", "void");

    assertEquals("m-1", behavior.id());
    assertEquals("pay()", behavior.name());
    assertEquals("支付", behavior.label());
    assertEquals("触发支付流程", behavior.description());
    assertEquals("void", behavior.returnType());
  }

  @Test
  public void should_create_entity_definition() {
    EntityAttribute attribute =
        new EntityAttribute("attr-1", "orderId", "订单编号", "UUID", "全局唯一标识", true, false, "public");

    EntityBehavior behavior = new EntityBehavior("m-1", "pay()", "支付", "触发支付流程", "void");

    EntityDefinition definition =
        new EntityDefinition(
            "客户购买商品生成的交易凭证",
            List.of("Core Domain", "Transaction"),
            List.of(attribute),
            List.of(behavior));

    assertEquals("客户购买商品生成的交易凭证", definition.description());
    assertEquals(2, definition.tags().size());
    assertEquals(1, definition.attributes().size());
    assertEquals(1, definition.behaviors().size());
  }
}
