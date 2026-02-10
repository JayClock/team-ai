import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Button,
} from '@shared/ui';
import { Settings2 } from 'lucide-react';

export function SettingsTool() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm">
          <Settings2 className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Diagram Settings</SheetTitle>
          <SheetDescription>
            Configure your diagram settings and preferences.
          </SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}
