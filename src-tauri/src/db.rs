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
        conn.execute(
            "CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )",
            [],
        )?;
        // Migration: add tags column if missing on pre-existing databases
        let _ = conn.execute("ALTER TABLE notes ADD COLUMN tags TEXT NOT NULL DEFAULT ''", []);
        Ok(Self {
            conn: Mutex::new(conn),
        })
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

    pub fn list(&self) -> Result<Vec<Note>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("db lock"))?;
        let mut stmt = conn.prepare(
            "SELECT id, title, content, tags, created_at, updated_at FROM notes ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Note {
                id: r.get(0)?,
                title: r.get(1)?,
                content: r.get(2)?,
                tags: r.get(3)?,
                created_at: r.get(4)?,
                updated_at: r.get(5)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    pub fn get(&self, id: i64) -> Result<Note> {
        let conn = self.conn.lock().map_err(|_| anyhow!("db lock"))?;
        let n = conn.query_row(
            "SELECT id, title, content, tags, created_at, updated_at FROM notes WHERE id = ?1",
            params![id],
            |r| {
                Ok(Note {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    content: r.get(2)?,
                    tags: r.get(3)?,
                    created_at: r.get(4)?,
                    updated_at: r.get(5)?,
                })
            },
        )?;
        Ok(n)
    }

    pub fn delete(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("db lock"))?;
        conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
        Ok(())
    }
}
