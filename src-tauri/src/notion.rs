use anyhow::{anyhow, Result};
use serde_json::{json, Value};

const NOTION_VERSION: &str = "2022-06-28";
const NOTION_API: &str = "https://api.notion.com/v1/pages";

pub async fn save_note(title: &str, markdown: &str) -> Result<String> {
    let token = std::env::var("NOTION_API_KEY")
        .map_err(|_| anyhow!("NOTION_API_KEY .env dosyasında tanımlı değil"))?;
    let database_id = std::env::var("NOTION_DATABASE_ID")
        .map_err(|_| anyhow!("NOTION_DATABASE_ID .env dosyasında tanımlı değil"))?;

    let title_prop = std::env::var("NOTION_TITLE_PROPERTY")
        .unwrap_or_else(|_| "Name".to_string());

    let safe_title = if title.trim().is_empty() {
        format!("Not — {}", chrono_today())
    } else {
        title.to_string()
    };

    let children = markdown_to_blocks(markdown);

    let body = json!({
        "parent": { "database_id": database_id },
        "properties": {
            title_prop: {
                "title": [{ "text": { "content": safe_title } }]
            }
        },
        "children": children
    });

    let client = reqwest::Client::new();
    let res = client
        .post(NOTION_API)
        .bearer_auth(token)
        .header("Notion-Version", NOTION_VERSION)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(anyhow!("Notion API hata {}: {}", status, text));
    }
    let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    Ok(v.get("url")
        .and_then(|u| u.as_str())
        .unwrap_or("saved")
        .to_string())
}

fn chrono_today() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{}", secs)
}

/// Çok basit bir markdown → Notion blokları çevirici.
/// Paragraf, başlık (#, ##, ###), madde listesi (-, *), numaralı liste (1.),
/// to-do (- [ ], - [x]), quote (>), divider (---), code (```).
fn markdown_to_blocks(md: &str) -> Vec<Value> {
    let mut blocks: Vec<Value> = Vec::new();
    let mut in_code = false;
    let mut code_buf = String::new();
    let mut code_lang = String::new();

    for raw_line in md.lines() {
        let line = raw_line;

        if let Some(stripped) = line.strip_prefix("```") {
            if in_code {
                blocks.push(json!({
                    "object": "block",
                    "type": "code",
                    "code": {
                        "rich_text": [rt(&code_buf)],
                        "language": if code_lang.is_empty() { "plain text".to_string() } else { code_lang.clone() }
                    }
                }));
                code_buf.clear();
                code_lang.clear();
                in_code = false;
            } else {
                in_code = true;
                code_lang = stripped.trim().to_string();
            }
            continue;
        }

        if in_code {
            if !code_buf.is_empty() {
                code_buf.push('\n');
            }
            code_buf.push_str(line);
            continue;
        }

        let t = line.trim_end();
        if t.is_empty() {
            continue;
        }

        if t.trim() == "---" {
            blocks.push(json!({
                "object": "block",
                "type": "divider",
                "divider": {}
            }));
            continue;
        }

        if let Some(rest) = t.strip_prefix("### ") {
            blocks.push(heading(3, rest));
            continue;
        }
        if let Some(rest) = t.strip_prefix("## ") {
            blocks.push(heading(2, rest));
            continue;
        }
        if let Some(rest) = t.strip_prefix("# ") {
            blocks.push(heading(1, rest));
            continue;
        }
        if let Some(rest) = t.strip_prefix("> ") {
            blocks.push(json!({
                "object": "block",
                "type": "quote",
                "quote": { "rich_text": [rt(rest)] }
            }));
            continue;
        }
        if let Some(rest) = t.strip_prefix("- [ ] ") {
            blocks.push(todo(rest, false));
            continue;
        }
        if let Some(rest) = t.strip_prefix("- [x] ").or_else(|| t.strip_prefix("- [X] ")) {
            blocks.push(todo(rest, true));
            continue;
        }
        if let Some(rest) = t.strip_prefix("- ").or_else(|| t.strip_prefix("* ")) {
            blocks.push(json!({
                "object": "block",
                "type": "bulleted_list_item",
                "bulleted_list_item": { "rich_text": [rt(rest)] }
            }));
            continue;
        }
        // numaralı liste (çok basit: "1. ")
        if let Some(idx) = t.find(". ") {
            if idx <= 2 && t[..idx].chars().all(|c| c.is_ascii_digit()) {
                let rest = &t[idx + 2..];
                blocks.push(json!({
                    "object": "block",
                    "type": "numbered_list_item",
                    "numbered_list_item": { "rich_text": [rt(rest)] }
                }));
                continue;
            }
        }

        blocks.push(json!({
            "object": "block",
            "type": "paragraph",
            "paragraph": { "rich_text": [rt(t)] }
        }));
    }

    if blocks.is_empty() {
        blocks.push(json!({
            "object": "block",
            "type": "paragraph",
            "paragraph": { "rich_text": [] }
        }));
    }
    blocks
}

fn heading(level: u8, text: &str) -> Value {
    let key = match level {
        1 => "heading_1",
        2 => "heading_2",
        _ => "heading_3",
    };
    json!({
        "object": "block",
        "type": key,
        key: { "rich_text": [rt(text)] }
    })
}

fn todo(text: &str, checked: bool) -> Value {
    json!({
        "object": "block",
        "type": "to_do",
        "to_do": { "rich_text": [rt(text)], "checked": checked }
    })
}

fn rt(text: &str) -> Value {
    json!({
        "type": "text",
        "text": { "content": text }
    })
}
