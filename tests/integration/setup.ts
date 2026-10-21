// Refuses to run against production: the production Neon host must never
// receive test writes (AGENTS.md).
const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].join(" ");
if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  throw new Error("Integration tests need DATABASE_URL (app_runtime) and DIRECT_URL (owner) of a TEST database.");
}
if (urls.includes("ep-rapid-hat")) {
  throw new Error("Refusing to run integration tests against the production database.");
}
