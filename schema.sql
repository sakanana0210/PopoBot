CREATE TABLE IF NOT EXISTS poop_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    count_date DATE NOT NULL,
    count INTEGER DEFAULT 0,
    UNIQUE(user_id, group_id, count_date)
);
