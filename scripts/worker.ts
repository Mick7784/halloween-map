import { tick } from "../lib/service";
import { dispatchReminders } from "../lib/reminders";
async function run() {
  try {
    await tick();
    await dispatchReminders();
  } catch {
    console.error(
      "Season worker: opération interrompue ; reprise au prochain passage",
    );
  } finally {
    setTimeout(() => void run(), 30000);
  }
}
await run();
