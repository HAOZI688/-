import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://contentos:contentos@localhost:5432/contentos";

export const sql = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});
