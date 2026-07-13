import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

type Db = NodePgDatabase<typeof schema>;

let poolInstance: pg.Pool | undefined;
let dbInstance: Db | undefined;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  return url;
}

function createPool(): pg.Pool {
  if (!poolInstance) {
    poolInstance = new Pool({ connectionString: getDatabaseUrl() });
  }
  return poolInstance;
}

function createDb(): Db {
  if (!dbInstance) {
    dbInstance = drizzle(createPool(), { schema });
  }
  return dbInstance;
}

export const pool = new Proxy({} as pg.Pool, {
  get(_target, prop, receiver) {
    return Reflect.get(createPool(), prop, receiver);
  },
});

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(createDb(), prop, receiver);
  },
});

export * from "./schema";
