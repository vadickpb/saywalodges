import {
  Baby,
  BedDouble,
  Car,
  ChefHat,
  Flame,
  Footprints,
  House,
  Landmark,
  Mountain,
  MountainSnow,
  Sparkles,
  Sunrise,
  TrainFront,
  TreePine,
  Users,
  Waves,
  Wifi,
  type LucideIcon,
} from "lucide-react";

// Rooms, amenities and distances store an emoji as their icon (that's what
// the current admin lets owners type). The template renders a matching line
// icon instead, so every tenant gets a consistent, professional icon set;
// unknown emoji fall back to a neutral sparkle.
const EMOJI_ICONS: Record<string, LucideIcon> = {
  "🏊": Waves,
  "🍳": ChefHat,
  "🏔️": MountainSnow,
  "🏔": MountainSnow,
  "⛰️": Mountain,
  "🏡": House,
  "🏠": House,
  "🌄": Sunrise,
  "🗿": Landmark,
  "🚗": Car,
  "🚂": TrainFront,
  "🚆": TrainFront,
  "🚶": Footprints,
  "🛏️": BedDouble,
  "🛏": BedDouble,
  "👨‍👩‍👧‍👦": Users,
  "👶": Baby,
  "🔥": Flame,
  "🌿": TreePine,
  "🌳": TreePine,
  "📶": Wifi,
};

export function SiteIcon({ emoji, className }: { emoji: string; className?: string }) {
  const Icon = EMOJI_ICONS[emoji] ?? Sparkles;
  return <Icon className={className} strokeWidth={1.5} aria-hidden="true" />;
}
