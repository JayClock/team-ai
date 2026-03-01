package reengineering.ddd.teamai.mybatis.knowledgegraph;

import java.util.Locale;

final class DeterministicEmbeddingEncoder {
  static final int DIMENSION = 8;

  private DeterministicEmbeddingEncoder() {}

  static double[] encode(String sourceText) {
    String input = sourceText == null ? "" : sourceText.trim().toLowerCase(Locale.ROOT);
    double[] vector = new double[DIMENSION];
    if (input.isEmpty()) {
      return vector;
    }

    String[] tokens = input.split("\\s+");
    for (String token : tokens) {
      int bucket = Math.floorMod(token.hashCode(), DIMENSION);
      vector[bucket] += 1d;
    }
    normalize(vector);
    return vector;
  }

  static String toPgArrayLiteral(double[] vector) {
    StringBuilder builder = new StringBuilder("{");
    for (int i = 0; i < vector.length; i += 1) {
      if (i > 0) {
        builder.append(',');
      }
      builder.append(String.format(Locale.ROOT, "%.8f", vector[i]));
    }
    builder.append('}');
    return builder.toString();
  }

  private static void normalize(double[] vector) {
    double sum = 0d;
    for (double value : vector) {
      sum += value * value;
    }
    if (sum == 0d) {
      return;
    }
    double norm = Math.sqrt(sum);
    for (int i = 0; i < vector.length; i += 1) {
      vector[i] /= norm;
    }
  }
}
