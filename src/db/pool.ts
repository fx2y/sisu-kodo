import { Pool } from "pg";

import { getConfig } from "../config";

export function createPool(databaseName?: string): Pool {
  const cfg = getConfig();
  return new Pool({
    host: cfg.dbHost,
    port: cfg.dbPort,
    user: cfg.dbUser,
    password: cfg.dbPassword,
    database: databaseName ?? cfg.appDbName,
    max: 8
  });
}
