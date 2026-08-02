//! Query profiling via EXPLAIN / EXPLAIN ANALYZE (engine-specific).

use serde::{Deserialize, Serialize};
use sqlx::{AnyPool, Row};
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryProfile {
    pub sql: String,
    pub dialect: String,
    pub profile_sql: String,
    pub total_time_ms: f64,
    pub planning_time_ms: Option<f64>,
    pub execution_time_ms: Option<f64>,
    pub plan_text: String,
    pub plan_json: Option<String>,
    pub summary: String,
    pub nodes: Vec<ProfileNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileNode {
    pub node_type: String,
    pub relation: Option<String>,
    pub cost: Option<f64>,
    pub actual_ms: Option<f64>,
    pub rows: Option<f64>,
    pub detail: String,
}

pub async fn profile_query(
    pool: &AnyPool,
    db_kind: &str,
    sql: &str,
) -> Result<QueryProfile, String> {
    let trimmed = sql.trim().trim_end_matches(';');
    if trimmed.is_empty() {
        return Err("Empty SQL".to_string());
    }
    // Reject multi-statement for safety
    if trimmed.contains(';') {
        return Err("Profile one statement at a time".to_string());
    }

    let kind = db_kind.to_lowercase();
    let start = Instant::now();

    match kind.as_str() {
        "postgres" | "postgresql" | "cockroachdb" | "redshift" => {
            let profile_sql = if is_select_like(trimmed) {
                format!("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {}", trimmed)
            } else {
                format!("EXPLAIN (FORMAT JSON) {}", trimmed)
            };
            let row = sqlx::query(&profile_sql)
                .fetch_one(pool)
                .await
                .map_err(|e| format!("EXPLAIN failed: {}", e))?;
            // Postgres returns a single column "QUERY PLAN" as JSON text or value
            let plan_json = row
                .try_get::<String, _>(0)
                .map_err(|e| format!("Failed to read EXPLAIN output: {}", e))?;

            let (nodes, planning, execution, summary) = parse_pg_explain_json(&plan_json);
            let total = start.elapsed().as_secs_f64() * 1000.0;
            Ok(QueryProfile {
                sql: trimmed.to_string(),
                dialect: "postgres".into(),
                profile_sql,
                total_time_ms: execution.unwrap_or(total),
                planning_time_ms: planning,
                execution_time_ms: execution,
                plan_text: plan_json.clone(),
                plan_json: Some(plan_json),
                summary,
                nodes,
            })
        }
        "mysql" | "mariadb" => {
            let profile_sql = format!("EXPLAIN FORMAT=JSON {}", trimmed);
            let row = sqlx::query(&profile_sql)
                .fetch_one(pool)
                .await
                .map_err(|e| format!("EXPLAIN failed: {}", e))?;
            let plan_json = row
                .try_get::<String, _>(0)
                .unwrap_or_else(|_| "{}".into());
            let total = start.elapsed().as_secs_f64() * 1000.0;
            // Also run EXPLAIN without JSON for readable text fallback
            let text_sql = format!("EXPLAIN {}", trimmed);
            let text_rows = sqlx::query(&text_sql).fetch_all(pool).await.unwrap_or_default();
            let mut plan_text = String::new();
            for r in text_rows {
                // MySQL EXPLAIN columns vary; dump as tab-separated best-effort
                let cols = r.columns().len();
                let mut parts = Vec::new();
                for i in 0..cols {
                    if let Ok(s) = r.try_get::<String, _>(i) {
                        parts.push(s);
                    } else if let Ok(n) = r.try_get::<i64, _>(i) {
                        parts.push(n.to_string());
                    } else {
                        parts.push("?".into());
                    }
                }
                plan_text.push_str(&parts.join(" | "));
                plan_text.push('\n');
            }
            let nodes = vec![ProfileNode {
                node_type: "MySQL EXPLAIN".into(),
                relation: None,
                cost: None,
                actual_ms: None,
                rows: None,
                detail: plan_text.chars().take(500).collect(),
            }];
            Ok(QueryProfile {
                sql: trimmed.to_string(),
                dialect: "mysql".into(),
                profile_sql,
                total_time_ms: total,
                planning_time_ms: None,
                execution_time_ms: Some(total),
                plan_text: if plan_text.is_empty() {
                    plan_json.clone()
                } else {
                    plan_text
                },
                plan_json: Some(plan_json),
                summary: "MySQL EXPLAIN (FORMAT=JSON)".into(),
                nodes,
            })
        }
        _ => {
            // SQLite EXPLAIN QUERY PLAN
            let profile_sql = format!("EXPLAIN QUERY PLAN {}", trimmed);
            let rows = sqlx::query(&profile_sql)
                .fetch_all(pool)
                .await
                .map_err(|e| format!("EXPLAIN QUERY PLAN failed: {}", e))?;
            let mut plan_text = String::new();
            let mut nodes = Vec::new();
            for r in rows {
                // selectid, order, from, detail
                let detail = r
                    .try_get::<String, _>(3)
                    .or_else(|_| r.try_get::<String, _>("detail"))
                    .unwrap_or_default();
                plan_text.push_str(&detail);
                plan_text.push('\n');
                nodes.push(ProfileNode {
                    node_type: "QUERY PLAN".into(),
                    relation: None,
                    cost: None,
                    actual_ms: None,
                    rows: None,
                    detail,
                });
            }
            let total = start.elapsed().as_secs_f64() * 1000.0;
            Ok(QueryProfile {
                sql: trimmed.to_string(),
                dialect: "sqlite".into(),
                profile_sql,
                total_time_ms: total,
                planning_time_ms: None,
                execution_time_ms: Some(total),
                plan_text,
                plan_json: None,
                summary: format!("{} plan step(s)", nodes.len()),
                nodes,
            })
        }
    }
}

fn is_select_like(sql: &str) -> bool {
    let u = sql.trim_start().to_uppercase();
    u.starts_with("SELECT") || u.starts_with("WITH") || u.starts_with("VALUES")
}

fn parse_pg_explain_json(
    plan_json: &str,
) -> (Vec<ProfileNode>, Option<f64>, Option<f64>, String) {
    let mut nodes = Vec::new();
    let mut planning = None;
    let mut execution = None;

    let val: serde_json::Value = match serde_json::from_str(plan_json) {
        Ok(v) => v,
        Err(_) => {
            return (
                nodes,
                None,
                None,
                "Could not parse EXPLAIN JSON".into(),
            );
        }
    };

    // Postgres EXPLAIN FORMAT JSON is an array of objects
    let root = val
        .as_array()
        .and_then(|a| a.first())
        .cloned()
        .unwrap_or(val);

    if let Some(p) = root.get("Planning Time").and_then(|v| v.as_f64()) {
        planning = Some(p);
    }
    if let Some(e) = root.get("Execution Time").and_then(|v| v.as_f64()) {
        execution = Some(e);
    }

    if let Some(plan) = root.get("Plan") {
        walk_pg_plan(plan, &mut nodes, 0);
    }

    let summary = format!(
        "{} node(s) · plan {:.2}ms · exec {:.2}ms",
        nodes.len(),
        planning.unwrap_or(0.0),
        execution.unwrap_or(0.0)
    );
    (nodes, planning, execution, summary)
}

fn walk_pg_plan(node: &serde_json::Value, out: &mut Vec<ProfileNode>, depth: usize) {
    let node_type = node
        .get("Node Type")
        .and_then(|v| v.as_str())
        .unwrap_or("Node")
        .to_string();
    let relation = node
        .get("Relation Name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let cost = node.get("Total Cost").and_then(|v| v.as_f64());
    let actual_ms = node
        .get("Actual Total Time")
        .and_then(|v| v.as_f64());
    let rows = node
        .get("Actual Rows")
        .or_else(|| node.get("Plan Rows"))
        .and_then(|v| v.as_f64());
    let pad = "  ".repeat(depth);
    let detail = format!(
        "{}{}{}",
        pad,
        node_type,
        relation
            .as_ref()
            .map(|r| format!(" on {}", r))
            .unwrap_or_default()
    );
    out.push(ProfileNode {
        node_type,
        relation,
        cost,
        actual_ms,
        rows,
        detail,
    });
    if let Some(children) = node.get("Plans").and_then(|v| v.as_array()) {
        for child in children {
            walk_pg_plan(child, out, depth + 1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::any::AnyPoolOptions;
    use sqlx::Executor;

    #[tokio::test]
    async fn test_sqlite_profile() {
        sqlx::any::install_default_drivers();
        let pool = AnyPoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        pool.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);")
            .await
            .unwrap();
        pool.execute("INSERT INTO t VALUES (1, 'a'), (2, 'b');")
            .await
            .unwrap();
        let p = profile_query(&pool, "sqlite", "SELECT * FROM t WHERE id = 1")
            .await
            .unwrap();
        assert_eq!(p.dialect, "sqlite");
        assert!(!p.nodes.is_empty() || !p.plan_text.is_empty());
    }
}
