import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <Tooltip content={`Switch to ${next} theme`}>
      <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={`Switch to ${next} theme`}>
        {theme === 'dark' ? <Sun /> : <Moon />}
      </Button>
    </Tooltip>
  );
}
