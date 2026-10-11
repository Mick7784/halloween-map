import { Candy, Sparkles, Drama } from "lucide-react";
import type { Activity } from "../lib/domain";
export const activityLabels: Record<Activity, string> = {
  CANDY: "Bonbons",
  DECORATION: "Décoration",
  ACTING: "Mise en scène",
};
export default function ActivityIcon({
  activity,
  size = 16,
}: {
  activity: Activity;
  size?: number;
}) {
  const Icon = { CANDY: Candy, DECORATION: Sparkles, ACTING: Drama }[activity];
  return <Icon size={size} aria-hidden="true" />;
}
