import { createPool, Pool } from "mysql2/promise";
import { env } from "./env";

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    pool = createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.name,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function verifyDbConnection() {
  await getDbPool().query("SELECT 1");
}
