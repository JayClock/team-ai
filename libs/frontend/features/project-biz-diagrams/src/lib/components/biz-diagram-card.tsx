import { State } from '@hateoas-ts/resource';
import { BizDiagram } from '@shared/schema';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@shared/ui/components/card';
import { Button } from '@shared/ui/components/button';
import { Trash2Icon, FileTextIcon } from 'lucide-react';

interface BizDiagramCardProps {
  diagramState: State<BizDiagram>;
}

export function BizDiagramCard({ diagramState }: BizDiagramCardProps) {
  const { data } = diagramState;

  if (!data) return null;

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-1">
            <FileTextIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-lg">{data.name}</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="删除图表"
          >
            <Trash2Icon className="h-4 w-4 text-destructive" />
          </Button>
        </div>
        {data.description && (
          <CardDescription className="mt-2 line-clamp-2">
            {data.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <Button variant="outline" className="w-full">
          查看详情
        </Button>
      </CardContent>
    </Card>
  );
}
