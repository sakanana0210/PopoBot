import sqlite3 from "sqlite3";
import { open } from "sqlite";

export async function initDB() {
  const db = await open({
    filename: "./poop.db",
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS poop_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      group_id TEXT,
      display_name TEXT,
      count_date DATE NOT NULL,
      count INTEGER DEFAULT 0,
      UNIQUE(user_id, group_id, count_date)
    )
  `);

  return db;
}
