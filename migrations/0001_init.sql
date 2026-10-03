-- Golden Ad Course – D1 schema
CREATE TABLE students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,               -- also the username (stored lower-case)
  phone TEXT,
  business TEXT,
  password_hash TEXT,                       -- pbkdf2$iterations$salt$hash
  access_status TEXT NOT NULL DEFAULT 'pending',  -- pending | active | revoked
  access_sent_at TEXT,
  joined_at TEXT NOT NULL,
  last_seen_at TEXT,
  note TEXT DEFAULT '',
  payment_ref TEXT,                         -- processor transaction id (idempotency)
  amount INTEGER,
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  marketing_consent_at TEXT,
  terms_accepted_at TEXT
);
CREATE TABLE progress (
  student_id TEXT NOT NULL, chapter INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0, updated_at TEXT,
  PRIMARY KEY (student_id, chapter)
);
CREATE TABLE answers (                      -- value is JSON (string, or array for checklists)
  student_id TEXT NOT NULL, question_id TEXT NOT NULL, value TEXT, updated_at TEXT,
  PRIMARY KEY (student_id, question_id)
);
CREATE TABLE goldie_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL,
  role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX goldie_student ON goldie_messages (student_id, id);
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,                   -- sha-256 of the cookie value
  student_id TEXT, is_admin INTEGER DEFAULT 0, expires_at TEXT NOT NULL
);
CREATE TABLE settings ( key TEXT PRIMARY KEY, value TEXT );
CREATE TABLE password_resets ( token TEXT PRIMARY KEY, student_id TEXT NOT NULL, expires_at TEXT NOT NULL );
CREATE TABLE rate_limits ( key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL );
