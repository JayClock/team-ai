package reengineering.ddd.knowledgegraph.extractor;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.ast.CompilationUnit;
import java.io.File;
import java.io.FileInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import reengineering.ddd.knowledgegraph.model.Graph;

public abstract class BaseExtractor {
  protected final Graph graph;
  protected final JavaParser parser;

  protected BaseExtractor(Graph graph) {
    this.graph = graph;
    ParserConfiguration config =
        new ParserConfiguration().setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_17);
    this.parser = new JavaParser(config);
  }

  public abstract void extract(Path basePath);

  protected List<File> findJavaFiles(Path path) {
    if (!Files.exists(path)) {
      return List.of();
    }

    try (Stream<Path> stream = Files.walk(path)) {
      return stream
          .filter(p -> p.toString().endsWith(".java"))
          .filter(Files::isRegularFile)
          .map(Path::toFile)
          .collect(Collectors.toList());
    } catch (Exception e) {
      throw new RuntimeException("Failed to find Java files in " + path, e);
    }
  }

  protected CompilationUnit parseFile(File file) {
    try (FileInputStream in = new FileInputStream(file)) {
      ParseResult<CompilationUnit> result = parser.parse(in);
      if (!result.isSuccessful()) {
        throw new RuntimeException(
            "Failed to parse file: " + file.getName() + " Errors: " + result.getProblems());
      }
      return result.getResult().orElseThrow();
    } catch (Exception e) {
      throw new RuntimeException("Failed to parse file: " + file.getName(), e);
    }
  }

  protected String getFilePath(File file) {
    return file.getAbsolutePath();
  }
}
