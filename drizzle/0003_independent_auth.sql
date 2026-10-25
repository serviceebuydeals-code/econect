CREATE TABLE auth_users(id TEXT PRIMARY KEY NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,salt TEXT NOT NULL,is_admin INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE TABLE auth_sessions(token_hash TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
--> statement-breakpoint
CREATE TABLE auth_reset_tokens(token_hash TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE auth_attempts(key TEXT PRIMARY KEY NOT NULL,count INTEGER NOT NULL DEFAULT 0,reset_at INTEGER NOT NULL);
