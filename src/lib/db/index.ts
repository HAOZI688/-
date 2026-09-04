import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "./client";
import * as schema from "./schema";

export const db = drizzle(sql, { schema });
