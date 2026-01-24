import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Action } from '@hateoas-ts/resource';
import { BizDiagram } from '@shared/schema';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@shared/ui/components/dialog';
import { Button } from '@shared/ui/components/button';
import { Input } from '@shared/ui/components/input';
import { Textarea } from '@shared/ui/components/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared/ui/components/select';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@shared/ui/components/field';
import { PlusIcon } from 'lucide-react';

interface BizDiagramUploadProps {
  action: Action<BizDiagram>;
}

export function BizDiagramUpload({ action }: BizDiagramUploadProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<BizDiagram['data']>({
    resolver: zodResolver(action.formSchema),
    defaultValues: {
      name: '',
      description: '',
      plantumlCode: '',
      diagramType: 'flowchart',
    },
  });

  const handleSubmit = async (data: BizDiagram['data']) => {
    try {
      setLoading(true);

      await action.submit({
        name: data.name.trim(),
        description: data.description?.trim() || undefined,
        plantumlCode: data.plantumlCode.trim(),
        diagramType: data.diagramType,
      });

      setOpen(false);
      form.reset();
    } catch (error) {
      console.error('Failed to create diagram:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="h-4 w-4 mr-2" />
          上传图表
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <DialogHeader>
            <DialogTitle>上传业务图表</DialogTitle>
            <DialogDescription>
              上传 PlantUML 业务流程图到当前项目
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="name">图表名称 *</FieldLabel>
                  <Input
                    {...field}
                    id="name"
                    aria-invalid={fieldState.invalid}
                    placeholder="例如：订单支付流程"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="description"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="description">描述</FieldLabel>
                  <Textarea
                    {...field}
                    id="description"
                    placeholder="描述此业务流程的用途"
                    rows={3}
                  />
                </Field>
              )}
            />

            <Controller
              name="diagramType"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="diagramType">图表类型</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="diagramType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flowchart">流程图</SelectItem>
                      <SelectItem value="sequence">时序图</SelectItem>
                      <SelectItem value="class">类图</SelectItem>
                      <SelectItem value="component">组件图</SelectItem>
                      <SelectItem value="state">状态图</SelectItem>
                      <SelectItem value="activity">活动图</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />

            <Controller
              name="plantumlCode"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="plantumlCode">
                    PlantUML 代码 *
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="plantumlCode"
                    aria-invalid={fieldState.invalid}
                    placeholder="@startuml&#10;A -> B: Hello&#10;B -> A: Hi&#10;@enduml"
                    rows={8}
                    className="font-mono text-sm"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
