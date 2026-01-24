import { State } from '@hateoas-ts/resource';
import { BizDiagram } from '@shared/schema';
import { useMemo } from 'react';

interface DiagramViewerProps {
  diagramState: State<BizDiagram>;
}

export function DiagramViewer({ diagramState }: DiagramViewerProps) {
  const svgContent = useMemo(() => {
    if (!diagramState?.data?.plantumlCode) return null;

    try {
      const encoded = btoa(
        diagramState.data.plantumlCode.replace(
          /[\u0080-\uFFFF]/g,
          function (c) {
            return String.fromCharCode(0xf280 + (c.charCodeAt(0) << 8));
          },
        ),
      );
      return `https://www.plantuml.com/plantuml/svg/${encoded}`;
    } catch (error) {
      console.error('Failed to encode PlantUML diagram:', error);
      return null;
    }
  }, [diagramState?.data?.plantumlCode]);

  if (!svgContent) {
    return (
      <div className="flex items-center justify-center h-64 bg-muted/20 rounded-lg">
        <p className="text-muted-foreground">无法加载图表</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-4 bg-background rounded-lg border">
      <img
        src={svgContent}
        alt={diagramState.data.name}
        className="max-w-full h-auto"
      />
    </div>
  );
}
