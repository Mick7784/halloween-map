import { tick } from "../lib/service";
import { dispatchEmails } from "../lib/mail";
async function run() {
  try {
    await tick();
    await dispatchEmails();
  } catch {
    console.error(
      "Season worker: opération interrompue ; reprise au prochain passage",
    );
  } finally {
    setTimeout(() => void run(), 30000);
  }
}
await run();
