declare module "lucide-react" {
  import type {
    ForwardRefExoticComponent,
    RefAttributes,
    SVGProps,
  } from "react";

  export type LucideProps = SVGProps<SVGSVGElement> & {
    size?: string | number;
    "stroke-width"?: string | number;
    color?: string;
    absoluteStrokeWidth?: boolean;
  };

  export type LucideIcon = ForwardRefExoticComponent<
    LucideProps & RefAttributes<SVGSVGElement>
  >;

  const icons: { [name: string]: LucideIcon };
  export default icons;

  export const ArrowLeft: LucideIcon;
  export const BookOpen: LucideIcon;
  export const CalendarClock: LucideIcon;
  export const Check: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronLeft: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const CircleCheckIcon: LucideIcon;
  export const Clipboard: LucideIcon;
  export const Copy: LucideIcon;
  export const Database: LucideIcon;
  export const Eye: LucideIcon;
  export const EyeOff: LucideIcon;
  export const FileText: LucideIcon;
  export const Filter: LucideIcon;
  export const FolderOpen: LucideIcon;
  export const History: LucideIcon;
  export const Home: LucideIcon;
  export const HomeIcon: LucideIcon;
  export const ImageIcon: LucideIcon;
  export const Info: LucideIcon;
  export const InfoIcon: LucideIcon;
  export const KeyRound: LucideIcon;
  export const Layers: LucideIcon;
  export const Layout: LucideIcon;
  export const Loader2: LucideIcon;
  export const Loader2Icon: LucideIcon;
  export const Lock: LucideIcon;
  export const LogOut: LucideIcon;
  export const OctagonXIcon: LucideIcon;
  export const Pause: LucideIcon;
  export const Pencil: LucideIcon;
  export const Play: LucideIcon;
  export const Plus: LucideIcon;
  export const Power: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const Save: LucideIcon;
  export const ScrollText: LucideIcon;
  export const Search: LucideIcon;
  export const Settings: LucideIcon;
  export const SettingsIcon: LucideIcon;
  export const ShieldCheck: LucideIcon;
  export const ShieldOff: LucideIcon;
  export const Sparkles: LucideIcon;
  export const StickyNote: LucideIcon;
  export const Table2: LucideIcon;
  export const TerminalSquare: LucideIcon;
  export const Trash2: LucideIcon;
  export const TriangleAlertIcon: LucideIcon;
  export const UploadCloud: LucideIcon;
  export const User: LucideIcon;
  export const Users: LucideIcon;
  export const Wand2: LucideIcon;
  export const X: LucideIcon;
}
