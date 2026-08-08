//! Schema-aware text-to-SQL assist. Shared by GUI IPC and CLI.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaTableContext {
    pub name: String,
    pub columns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiAssistRequest {
    pub provider: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub api_key: Option<String>,
    pub db_type: String,
    pub active_table: Option<String>,
    pub last_queries: Vec<String>,
    pub tables: Vec<SchemaTableContext>,
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiAssistResponse {
    pub sql: String,
    pub is_write: bool,
    pub provider: String,
    pub model: String,
}

pub fn build_sql_assist_prompt(req: &AiAssistRequest) -> String {
    let schema_context: Vec<String> = req
        .tables
        .iter()
        .take(40)
        .map(|t| {
            let shown: Vec<&str> = t.columns.iter().take(30).map(|s| s.as_str()).collect();
            let more = if t.columns.len() > 30 { ", …" } else { "" };
            format!("Table: {} ({}{})", t.name, shown.join(", "), more)
        })
        .collect();
    let schema_note = if req.tables.len() > 40 {
        format!("\n(…{} more tables omitted)", req.tables.len() - 40)
    } else {
        String::new()
    };
    let recent = req
        .last_queries
        .iter()
        .take(3)
        .cloned()
        .collect::<Vec<_>>()
        .join("; ");
    format!(
        "You are a SQL assistant for a {} database. Given this schema:\n{}{}\n\nActive table: {}\nRecent queries: {}\n\nUser request: \"{}\"\n\nGenerate ONLY valid SQL query. No markdown formatting, no explanations. If unsafe or unclear, respond with ERROR: reason. Do not invent tables/columns not listed.",
        req.db_type,
        schema_context.join("\n"),
        schema_note,
        req.active_table.as_deref().unwrap_or("none"),
        recent,
        req.prompt
    )
}

pub fn looks_like_write(sql: &str) -> bool {
    crate::db::safe_mode::sql_contains_write(sql)
}

fn clean_sql(raw: &str) -> String {
    raw.replace("```sql", "")
        .replace("```SQL", "")
        .replace("```", "")
        .trim()
        .to_string()
}

/// Blocking HTTP call to the configured provider. Run inside `spawn_blocking` from async callers.
pub fn complete_sql_blocking(req: &AiAssistRequest) -> Result<AiAssistResponse, String> {
    let provider = req.provider.to_lowercase();
    let prompt = build_sql_assist_prompt(req);
    let (content, model) = match provider.as_str() {
        "ollama" => {
            let base = req
                .base_url
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or("http://localhost:11434");
            let model = req
                .model
                .clone()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "qwen2.5-coder".into());
            let body = serde_json::json!({
                "model": model,
                "prompt": prompt,
                "stream": false
            });
            let resp = ureq::post(&format!("{}/api/generate", base.trim_end_matches('/')))
                .send_json(body)
                .map_err(|e| format!("Cannot connect to Ollama at {base}: {e}"))?;
            let v: serde_json::Value = resp
                .into_json()
                .map_err(|e| format!("Ollama JSON: {e}"))?;
            (
                v.get("response")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string(),
                model,
            )
        }
        "openai" | "custom" | "deepseek" => {
            let base = req.base_url.as_deref().filter(|s| !s.is_empty()).unwrap_or(
                if provider == "deepseek" {
                    "https://api.deepseek.com/v1"
                } else {
                    "https://api.openai.com/v1"
                },
            );
            let model = req
                .model
                .clone()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "gpt-4o-mini".into());
            let key = req
                .api_key
                .as_deref()
                .filter(|s| !s.is_empty())
                .ok_or_else(|| format!("No API key configured for {provider}"))?;
            let body = serde_json::json!({
                "model": model,
                "messages": [{"role": "user", "content": prompt}]
            });
            let resp = ureq::post(&format!("{}/chat/completions", base.trim_end_matches('/')))
                .set("Authorization", &format!("Bearer {key}"))
                .send_json(body)
                .map_err(|e| format!("{provider} request failed: {e}"))?;
            let v: serde_json::Value = resp
                .into_json()
                .map_err(|e| format!("{provider} JSON: {e}"))?;
            let text = v
                .pointer("/choices/0/message/content")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            (text, model)
        }
        "claude" | "anthropic" => {
            let base = req
                .base_url
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or("https://api.anthropic.com/v1");
            let model = req
                .model
                .clone()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "claude-sonnet-4-6-20250514".into());
            let key = req
                .api_key
                .as_deref()
                .filter(|s| !s.is_empty())
                .ok_or("No API key configured for Claude")?;
            let body = serde_json::json!({
                "model": model,
                "max_tokens": 512,
                "messages": [{"role": "user", "content": prompt}]
            });
            let resp = ureq::post(&format!("{}/messages", base.trim_end_matches('/')))
                .set("x-api-key", key)
                .set("anthropic-version", "2023-06-01")
                .send_json(body)
                .map_err(|e| format!("Claude request failed: {e}"))?;
            let v: serde_json::Value = resp.into_json().map_err(|e| format!("Claude JSON: {e}"))?;
            let text = v
                .pointer("/content/0/text")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            (text, model)
        }
        other => return Err(format!("Unknown AI provider '{other}'")),
    };

    let sql = clean_sql(&content);
    if sql.is_empty() {
        return Err(format!("No response from {}", req.provider));
    }
    if sql.starts_with("ERROR:") {
        return Err(sql[6..].trim().to_string());
    }
    Ok(AiAssistResponse {
        is_write: looks_like_write(&sql),
        sql,
        provider: req.provider.clone(),
        model,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_includes_schema_and_user_request() {
        let req = AiAssistRequest {
            provider: "ollama".into(),
            base_url: None,
            model: None,
            api_key: None,
            db_type: "postgres".into(),
            active_table: Some("users".into()),
            last_queries: vec!["select 1".into()],
            tables: vec![SchemaTableContext {
                name: "users".into(),
                columns: vec!["id".into(), "email".into()],
            }],
            prompt: "count users".into(),
        };
        let p = build_sql_assist_prompt(&req);
        assert!(p.contains("Table: users (id, email)"));
        assert!(p.contains("count users"));
        assert!(p.contains("postgres"));
    }
}
