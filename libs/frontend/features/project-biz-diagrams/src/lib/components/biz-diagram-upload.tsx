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
            {action.fields.map((fieldConfig) => (
              <Controller
                key={fieldConfig.name}
                name={fieldConfig.name as never}
                control={form.control}
                render={({ field, fieldState }) => {
                  const renderField = () => {
                    switch (fieldConfig.type) {
                      case 'select': {
                        const options =
                          'options' in fieldConfig ? fieldConfig.options : [];
                        return (
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger id={fieldConfig.name}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.isArray(options)
                                ? options.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))
                                : Object.entries(options).map(
                                    ([value, label]) => (
                                      <SelectItem key={value} value={value}>
                                        {label}
                                      </SelectItem>
                                    ),
                                  )}
                            </SelectContent>
                          </Select>
                        );
                      }

                      case 'textarea':
                        return (
                          <Textarea
                            {...field}
                            id={fieldConfig.name}
                            placeholder={String(fieldConfig.placeholder ?? '')}
                            rows={'rows' in fieldConfig ? fieldConfig.rows : 3}
                            className={
                              fieldConfig.name === 'plantumlCode'
                                ? 'font-mono text-sm'
                                : undefined
                            }
                          />
                        );

                      case 'text':
                      default:
                        return (
                          <Input
                            {...field}
                            id={fieldConfig.name}
                            placeholder={String(fieldConfig.placeholder ?? '')}
                          />
                        );
                    }
                  };

                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={fieldConfig.name}>
                        {fieldConfig.label}
                        {fieldConfig.required && ' *'}
                      </FieldLabel>
                      {renderField()}
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  );
                }}
              />
            ))}
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
