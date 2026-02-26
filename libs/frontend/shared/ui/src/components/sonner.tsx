import { Toaster as Sonner, toast } from 'sonner';

function Toaster(props: React.ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      closeButton
      richColors
      position="top-right"
      {...props}
    />
  );
}

export { Toaster, toast };
