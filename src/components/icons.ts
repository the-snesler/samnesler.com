// `unplugin-icons` resolves `~icons/*` at build time, so every icon must be imported statically.
// The nav links in `Header.astro` and the button rows on the homepage carry icon *names* as data,
// so this registry is what lets a runtime string still reach a compile-time component.
//
// Adding an icon: import it here and add it to `ICONS`. `IconName` then accepts it everywhere.
import Book from '~icons/lucide/book';
import ChevronDown from '~icons/lucide/chevron-down';
import ChevronRight from '~icons/lucide/chevron-right';
import House from '~icons/lucide/house';
import Maximize2 from '~icons/lucide/maximize-2';
import Menu from '~icons/lucide/menu';
import Moon from '~icons/lucide/moon';
import NotebookText from '~icons/lucide/notebook-text';
import Rss from '~icons/lucide/rss';
import Sun from '~icons/lucide/sun';
import Twitter from '~icons/lucide/twitter';
import X from '~icons/lucide/x';
import Discord from '~icons/simple-icons/discord';
import Github from '~icons/simple-icons/github';
import Instagram from '~icons/simple-icons/instagram';
import Linkedin from '~icons/simple-icons/linkedin';
import SimpleTwitter from '~icons/simple-icons/twitter';

export const ICONS = {
  'lucide:book': Book,
  'lucide:chevron-down': ChevronDown,
  'lucide:chevron-right': ChevronRight,
  'lucide:house': House,
  'lucide:maximize-2': Maximize2,
  'lucide:menu': Menu,
  'lucide:moon': Moon,
  'lucide:notebook-text': NotebookText,
  'lucide:rss': Rss,
  'lucide:sun': Sun,
  'lucide:twitter': Twitter,
  'lucide:x': X,
  'simple-icons:discord': Discord,
  'simple-icons:github': Github,
  'simple-icons:instagram': Instagram,
  'simple-icons:linkedin': Linkedin,
  'simple-icons:twitter': SimpleTwitter
} as const;

export type IconName = keyof typeof ICONS;
