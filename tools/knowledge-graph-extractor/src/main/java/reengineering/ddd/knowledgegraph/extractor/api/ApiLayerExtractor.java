package reengineering.ddd.knowledgegraph.extractor.api;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.MemberValuePair;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import java.io.File;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import reengineering.ddd.knowledgegraph.extractor.BaseExtractor;
import reengineering.ddd.knowledgegraph.model.*;

public class ApiLayerExtractor extends BaseExtractor {

  public ApiLayerExtractor(Graph graph) {
    super(graph);
  }

  @Override
  public void extract(Path basePath) {
    Path apiPath = basePath.resolve("libs/backend/api/src/main/java");
    List<File> javaFiles = findJavaFiles(apiPath);

    for (File file : javaFiles) {
      CompilationUnit cu = parseFile(file);
      new ApiVisitor().visit(cu, null);
    }
  }

  private class ApiVisitor extends VoidVisitorAdapter<Void> {
    @Override
    public void visit(ClassOrInterfaceDeclaration n, Void arg) {
      super.visit(n, arg);

      if (!n.isInterface() && hasAnnotation(n, "Path")) {
        String className = n.getNameAsString();
        String path = getAnnotationValue(n, "Path", "").orElse("");
        String packageName =
            n.findCompilationUnit()
                .flatMap(cu -> cu.getPackageDeclaration())
                .map(pd -> pd.getNameAsString())
                .orElse("");

        String fullyQualifiedName = packageName + "." + className;
        JAXRSResourceNode resourceNode =
            new JAXRSResourceNode(fullyQualifiedName, path, Layer.API_LAYER);
        graph.addNode(resourceNode);

        graph.addRelationship(
            new Relationship(
                resourceNode.getId(),
                "LAYER:" + Layer.API_LAYER.name(),
                Relationship.Type.BELONGS_TO));

        processFields(n, fullyQualifiedName);
        processMethods(n, fullyQualifiedName);
      }

      checkForHATEOASModel(n);
    }

    private void processFields(ClassOrInterfaceDeclaration clazz, String className) {
      clazz
          .getFields()
          .forEach(
              field -> {
                if (hasAnnotation(field, "Inject") || hasAnnotation(field, "Context")) {
                  field
                      .getVariables()
                      .forEach(
                          variable -> {
                            String typeName = variable.getTypeAsString();
                            if (!typeName.equals("ResourceContext")
                                && !typeName.equals("UriInfo")
                                && !typeName.equals("Sse")
                                && !typeName.equals("SseEventSink")) {
                              graph.addRelationship(
                                  new Relationship(
                                      "JAXRS:" + className,
                                      "ENTITY:" + typeName,
                                      Relationship.Type.INJECTS));
                            }
                          });
                }
              });
    }

    private void processMethods(ClassOrInterfaceDeclaration clazz, String className) {
      clazz
          .getMethods()
          .forEach(
              method -> {
                String methodName = method.getNameAsString();
                String signature = method.getDeclarationAsString(false, false, false);
                String visibility = "public";

                if (hasAnnotation(method, "GET")
                    || hasAnnotation(method, "POST")
                    || hasAnnotation(method, "PUT")
                    || hasAnnotation(method, "DELETE")) {

                  MethodNode methodNode =
                      new MethodNode(className, methodName, signature, visibility);
                  graph.addNode(methodNode);

                  graph.addRelationship(
                      new Relationship(
                          "JAXRS:" + className, methodNode.getId(), Relationship.Type.CONTAINS));

                  if (hasAnnotation(method, "POST")) {
                    graph.addRelationship(
                        new Relationship(
                            methodNode.getId(), "POST Request", Relationship.Type.TRIGGERED_BY));
                  }

                  if (methodName.equals("chat")) {
                    graph.addRelationship(
                        new Relationship(
                            methodNode.getId(), "SSE Stream", Relationship.Type.RETURNS_STREAM));
                  }
                }
              });
    }

    private void checkForHATEOASModel(ClassOrInterfaceDeclaration n) {
      String extendedType =
          n.getExtendedTypes().stream().map(type -> type.getNameAsString()).findFirst().orElse("");

      if (extendedType.equals("RepresentationModel")) {
        String className = n.getNameAsString();
        String packageName =
            n.findCompilationUnit()
                .flatMap(cu -> cu.getPackageDeclaration())
                .map(pd -> pd.getNameAsString())
                .orElse("");
        String fullyQualifiedName = packageName + "." + className;

        HATEOASModelNode modelNode = new HATEOASModelNode(fullyQualifiedName, "collection");
        graph.addNode(modelNode);

        graph.addRelationship(
            new Relationship(
                modelNode.getId(),
                "LAYER:" + Layer.API_LAYER.name(),
                Relationship.Type.BELONGS_TO));
      }
    }

    private boolean hasAnnotation(ClassOrInterfaceDeclaration clazz, String annotationName) {
      return clazz.getAnnotations().stream()
          .anyMatch(a -> a.getNameAsString().equals(annotationName));
    }

    private boolean hasAnnotation(MethodDeclaration method, String annotationName) {
      return method.getAnnotations().stream()
          .anyMatch(a -> a.getNameAsString().equals(annotationName));
    }

    private boolean hasAnnotation(FieldDeclaration field, String annotationName) {
      return field.getAnnotations().stream()
          .anyMatch(a -> a.getNameAsString().equals(annotationName));
    }

    private Optional<String> getAnnotationValue(
        ClassOrInterfaceDeclaration clazz, String annotationName, String attribute) {
      return clazz
          .getAnnotationByName(annotationName)
          .filter(AnnotationExpr::isNormalAnnotationExpr)
          .map(AnnotationExpr::asNormalAnnotationExpr)
          .flatMap(
              na ->
                  na.getPairs().stream()
                      .filter(pair -> pair.getNameAsString().equals(attribute))
                      .findFirst()
                      .map(MemberValuePair::getValue)
                      .map(value -> value.toString().replace("\"", "")));
    }
  }
}
