use anyhow::{anyhow, Result};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub tags: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub folder_id: Option<i64>,
    pub status: String,
    pub pinned: bool,
    pub encrypted: bool,
    pub encrypted_content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Folder {
    pub id: i64,
    pub name: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NoteVersion {
    pub id: String,
    pub note_id: i64,
    pub title: String,
    pub content: String,
    pub label: Option<String>,
    pub saved_at: i64,
}

pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: PathBuf) -> Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let conn = Connection::open(&path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                folder_id INTEGER,
                status TEXT NOT NULL DEFAULT 'none',
                pinned INTEGER NOT NULL DEFAULT 0,
                encrypted INTEGER NOT NULL DEFAULT 0,
                encrypted_content TEXT
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS note_versions (
                id TEXT PRIMARY KEY,
                note_id INTEGER NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                label TEXT,
                saved_at INTEGER NOT NULL,
                FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Migrations for pre-existing databases
        let migrations = [
            "ALTER TABLE notes ADD COLUMN tags TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE notes ADD COLUMN folder_id INTEGER",
            "ALTER TABLE notes ADD COLUMN status TEXT NOT NULL DEFAULT 'none'",
            "ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE notes ADD COLUMN encrypted INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE notes ADD COLUMN encrypted_content TEXT",
        ];
        for m in &migrations {
            let _ = conn.execute(m, []);
        }

        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn insert(&self, title: &str, content: &str, tags: &str) -> Result<i64> {
        let now = chrono::Utc::now().timestamp_millis();
        let conn = self.conn.lock().map_err(|_| anyhow!("db lock"))?;
        conn.execute(
            "INSERT INTO notes (title, content, tags, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
            params![title, content, tags, now],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn update(&self, id: i64, title: &str, content: &str, tags: &str) -> Result<()> {
        let now = chrono::Utc::now().timestamp_millis();
        let conn = self.conn.lock().map_err(|_| anyhow!("db lock"))?;
        conn.execute(
            "UPDATE notes SET title = ?1, content = ?2, tags = ?3, updated_at = ?4 WHERE id = ?5",
            params![title, content, tags, now, id],
        )?;
        Ok(())
    }

    pub fn update_meta(&self, id: i64, folder_id: Option<i64>, status: &str, pinned: bool, encrypted: bool, encrypted_content: Option<&str>) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("db lock"))?;
        conn.execute(
            "UPDATE notes SET folder_id = ?1, status = ?2, pinned = ?3, encrypted = ?4, encrypted_content = ?5 WHERE id = ?6",
            params![folder_id, status, pinned as i64, encrypted as i64, encrypted_content, id],
        )?;
        Ok(())
    }

    pub fn list(&self) -> Result<Vec<Note>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("db lock"))?;
        let mut stmt = conn.prepare(
            "SELECT id, title, content, tags, created_at, updated_at, folder_id, status, pinned, encrypted, encrypted_content FROM notes ORDER BY pinned DESC, updated_at DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Note {
                id: r.get(0)?,
                title: r.get(1)?,
                content: r.get(2)?,
                tags: r.get(3)?,
                created_at: r.get(4)?,
                updated_at: r.get(5)?,
                folder_id: r.get(6)?,
                status: r.get::<_, Option<String>>(7)?.unwrap_or_else(|| "none".to_string()),
                pinned: r.get::<_, i64>(8)? != 0,
                encrypted: r.get::<_, i64>(9)? != 0,
                encrypted_content: r.get(10)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows { out.push(r?); }
        Ok(out)
    }

    pub fn get(&self, id: i64) -> Result<Note> {
        let conn = self.conn.lock().map_err(|_| anyhow!("db lock"))?;
        let n = conn.query_row(
            "SELECT id, title, content, tags, created_at, updated_at, folder_id, status, pinned, encrypted, encrypted_content FROM notes WHERE id = ?1",
            params![id],
            |r| Ok(Note {
                id: r.get(0)?,
                title: r.get(1)?,
                content: r.get(2)?,
                tags: r.get(3)?,
                created_at: r.get(4)?,
                updated_at: r.get(5)?,
                folder_id: r.get(6)?,
                status: r.get::<_, Option<String>>(7)?.unwrap_or_else(|| "none".to_string()),
                pinned: r.get::<_, i64>(8)? != 0,
                encrypted: r.get::<_, i64>(9)? != 0,
                encrypted_content: r.get(10)?,
            }),
        )?;
        Ok(n)
    }

    pub fn delete(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("db lock"))?;
        conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
        conn.execute("DELETE FROM note_versions WHERE note_id = ?1", params![id])?;
        Ok(())
    }

    // Folders
    pub fn create_folder(&self, name: &str) -> Result<i64> {
        let now = chrono::Utc::now().timestamp_millis();
        let conn = self.conn.lock().map_err(|_| anyhow!("db lock"))?;
        conn.execute("INSERT INTO folders (name, created_at) VALUES (?1, ?2)", params![name, now])?;
        Ok(conn.last_insert_rowid())
    }

    pub fn list_folders(&self) -> Result<Vec<Folder>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("db lock"))?;
        let mut stmt = conn.prepare("SELECT id, name, created_at FROM folders ORDER BY name ASC")?;
        let rows = stmt.query_map([], |r| Ok(Folder { id: r.get(0)?, name: r.get(1)?, created_at: r.get(2)? }))?;
        let mut out = Vec::new();
        for r in rows { out.push(r?); }
        Ok(out)
    }

    pub fn rename_folder(&self, id: i64, name: &str) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("db lock"))?;
        conn.execute("UPDATE folders SET name = ?1 WHERE id = ?2", params![name, id])?;
        Ok(())
    }

    pub fn delete_folder(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("db lock"))?;
        conn.execute("UPDATE notes SET folder_id = NULL WHERE folder_id = ?1", params![id])?;
        conn.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
        Ok(())
    }

    // Version history
    pub fn save_version(&self, note_id: i64, title: &str, content: &str, label: Option<&str>) -> Result<String> {
        let conn = self.conn.lock().map_err(|_| anyhow!("db lock"))?;
        // Keep max 20 versions per note
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM note_versions WHERE note_id = ?1",
            params![note_id],
            |r| r.get(0),
        )?;
        if count >= 20 {
            conn.execute(
                "DELETE FROM note_versions WHERE id IN (SELECT id FROM note_versions WHERE note_id = ?1 ORDER BY saved_at ASC LIMIT ?2)",
                params![note_id, count - 19],
            )?;
        }
        let id = format!("{}-{}", note_id, chrono::Utc::now().timestamp_millis());
        let now = chrono::Utc::now().timestamp_millis();
        conn.execute(
            "INSERT INTO note_versions (id, note_id, title, content, label, saved_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, note_id, title, content, label, now],
        )?;
        Ok(id)
    }

    pub fn list_versions(&self, note_id: i64) -> Result<Vec<NoteVersion>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("db lock"))?;
        let mut stmt = conn.prepare(
            "SELECT id, note_id, title, content, label, saved_at FROM note_versions WHERE note_id = ?1 ORDER BY saved_at DESC",
        )?;
        let rows = stmt.query_map(params![note_id], |r| Ok(NoteVersion {
            id: r.get(0)?,
            note_id: r.get(1)?,
            title: r.get(2)?,
            content: r.get(3)?,
            label: r.get(4)?,
            saved_at: r.get(5)?,
        }))?;
        let mut out = Vec::new();
        for r in rows { out.push(r?); }
        Ok(out)
    }

    pub fn delete_version(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("db lock"))?;
        conn.execute("DELETE FROM note_versions WHERE id = ?1", params![id])?;
        Ok(())
    }
}
