package reengineering.ddd.knowledgegraph.model;

public class LayerNode extends Node {
  public LayerNode(Layer layer) {
    super("LAYER:" + layer.name());
    setProperty("name", layer.getDisplayName());
  }

  @Override
  public String getType() {
    return "Layer";
  }
}
