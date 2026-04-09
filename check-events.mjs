import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL);
const agents = await sql`SELECT id, name FROM agents WHERE name = 'X'`;
if (!agents.length) { console.log("X agent not found"); process.exit(0); }
const xId = agents[0].id;
const runs = await sql`SELECT id, trigger, created_at, input FROM task_runs WHERE agent_id = ${xId} ORDER BY created_at DESC LIMIT 5`;
for (const run of runs) {
  console.log("=== RUN:", run.id, "trigger:", run.trigger, "at:", run.created_at);
  const events = await sql`SELECT type, content, metadata, timestamp FROM events WHERE task_run_id = ${run.id} ORDER BY timestamp ASC`;
  for (const e of events) {
    const meta = e.metadata ? JSON.stringify(e.metadata).slice(0, 300) : "";
    console.log(" ", e.type, "|", e.content?.slice(0, 500), meta ? "| meta:" + meta : "");
  }
  console.log("");
}
await sql.end();
process.exit(0);
