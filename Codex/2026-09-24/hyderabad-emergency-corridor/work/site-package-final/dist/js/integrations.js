export async function sendNotification(webhookUrl, event, payload) {
  if (!webhookUrl) return { skipped: true };
  const body = JSON.stringify({ event, source: "hyderabad-green-corridor-lab", simulated: true, ...payload });
  try {
    const response = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
