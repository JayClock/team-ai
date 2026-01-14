import { useState, useEffect } from 'react';
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
import { SettingsIcon, EyeIcon, EyeOffIcon, CheckIcon } from 'lucide-react';
import { apiKeyStorage } from '../../lib/api-key-storage';

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      const storedKey = apiKeyStorage.get();
      setApiKey(storedKey || '');
      setSaved(false);
    }
  }, [open]);

  const handleSave = () => {
    if (apiKey.trim()) {
      apiKeyStorage.set(apiKey.trim());
    } else {
      apiKeyStorage.remove();
    }
    setSaved(true);
    setTimeout(() => {
      setOpen(false);
      setSaved(false);
    }, 500);
  };

  const handleClear = () => {
    apiKeyStorage.remove();
    setApiKey('');
  };

  const hasStoredKey = apiKeyStorage.exists();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Settings"
        >
          <SettingsIcon className="h-4 w-4" />
          <span className="sr-only">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>API Key Settings</DialogTitle>
          <DialogDescription>
            Enter your DeepSeek API Key to enable AI chat functionality. Your
            key is stored locally in your browser.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Input
              type={showKey ? 'text' : 'password'}
              placeholder="Enter your DeepSeek API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? (
                <EyeOffIcon className="h-4 w-4 text-muted-foreground" />
              ) : (
                <EyeIcon className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="sr-only">
                {showKey ? 'Hide API Key' : 'Show API Key'}
              </span>
            </Button>
          </div>
          {!hasStoredKey && !apiKey && (
            <p className="text-sm text-amber-600 dark:text-amber-500">
              No API Key configured. Chat functionality will not work until you
              set one.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClear} disabled={!apiKey}>
            Clear
          </Button>
          <Button onClick={handleSave} disabled={saved}>
            {saved ? (
              <>
                <CheckIcon className="mr-2 h-4 w-4" />
                Saved
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
