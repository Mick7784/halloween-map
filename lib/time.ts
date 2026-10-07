export type TimeContext = { now: Date };
export function realTime(): TimeContext {
  return { now: new Date() };
}
