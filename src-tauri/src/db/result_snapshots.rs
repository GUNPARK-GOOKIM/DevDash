//! Local query-result snapshots + paged row-level diff.
//! Stored in the app SQLite DB (same pool as query history / saved queries).
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::sqlite::SqlitePool;
use sqlx::Row;
use std::collections::HashMap;

/// Soft cap so a single snapshot cannot unbounded-fill the app DB.
pub const MAX_SNAPSHOT_ROWS: usize = 100_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SnapshotMeta {
    pub id: String,
    pub name: String,
    pub connection_id: String,
    pub connection_name: String,
    pub sql_text: String,
    pub columns: Vec<String>,
    pub row_count: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SnapshotDiffKind {
    Added,
    Removed,
    Changed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SnapshotDiffRow {
    pub kind: SnapshotDiffKind,
    pub row_key: String,
    pub left_row: Option<Vec<Value>>,
    pub right_row: Option<Vec<Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SnapshotDiffResult {
    pub left_id: String,
    pub right_id: String,
    pub added: i64,
    pub removed: i64,
    pub changed: i64,
    pub unchanged: i64,
    /// Paged subset of non-unchanged rows (added + removed + changed).
    pub rows: Vec<SnapshotDiffRow>,
    pub total_diff_rows: i64,
    pub offset: i64,
    pub limit: i64,
}

pub async fn ensure_snapshot_schema(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS result_snapshots (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            connection_id TEXT NOT NULL,
            connection_name TEXT NOT NULL,
            sql_text TEXT NOT NULL,
            columns_json TEXT NOT NULL,
            row_count INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("snapshot schema (meta): {}", e))?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS result_snapshot_rows (
            snapshot_id TEXT NOT NULL,
            row_idx INTEGER NOT NULL,
            row_key TEXT NOT NULL,
            row_json TEXT NOT NULL,
            PRIMARY KEY (snapshot_id, row_idx)
        );",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("snapshot schema (rows): {}", e))?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_result_snapshot_rows_key
         ON result_snapshot_rows (snapshot_id, row_key);",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("snapshot schema (index): {}", e))?;

    Ok(())
}

/// Build a stable row key. Uses first column when present; otherwise full-row JSON.
pub fn compute_row_key(columns: &[String], row: &[Value]) -> String {
    if columns.is_empty() || row.is_empty() {
        return serde_json::to_string(row).unwrap_or_default();
    }
    // Prefer first column as identity (typical PK-leading SELECT *)
    match row.first() {
        Some(Value::Null) | None => {
            format!("∅|{}", serde_json::to_string(row).unwrap_or_default())
        }
        Some(v) => {
            let primary = match v {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            primary
        }
    }
}

pub async fn save_result_snapshot(
    pool: &SqlitePool,
    name: &str,
    connection_id: &str,
    connection_name: &str,
    sql_text: &str,
    columns: &[String],
    rows: &[Vec<Value>],
) -> Result<SnapshotMeta, String> {
    if rows.len() > MAX_SNAPSHOT_ROWS {
        return Err(format!(
            "Snapshot too large ({} rows). Max is {} rows per snapshot.",
            rows.len(),
            MAX_SNAPSHOT_ROWS
        ));
    }
    if columns.is_empty() && !rows.is_empty() {
        return Err("Cannot snapshot rows without column names".to_string());
    }

    ensure_snapshot_schema(pool).await?;

    let id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();
    let columns_json =
        serde_json::to_string(columns).map_err(|e| format!("columns json: {}", e))?;
    let row_count = rows.len() as i64;

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("begin snapshot tx: {}", e))?;

    sqlx::query(
        "INSERT INTO result_snapshots
         (id, name, connection_id, connection_name, sql_text, columns_json, row_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(connection_id)
    .bind(connection_name)
    .bind(sql_text)
    .bind(&columns_json)
    .bind(row_count)
    .bind(&created_at)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("insert snapshot meta: {}", e))?;

    // Batch insert rows (one-by-one sqlx; bounded by MAX_SNAPSHOT_ROWS).
    // Disambiguate duplicate first-column keys so diffs stay stable (#1, #2, …).
    let mut key_counts: HashMap<String, usize> = HashMap::new();
    for (idx, row) in rows.iter().enumerate() {
        let base_key = compute_row_key(columns, row);
        let n = key_counts.entry(base_key.clone()).or_insert(0);
        let key = if *n == 0 {
            base_key
        } else {
            format!("{}#{}", base_key, n)
        };
        *n += 1;
        let row_json =
            serde_json::to_string(row).map_err(|e| format!("row json {}: {}", idx, e))?;
        sqlx::query(
            "INSERT INTO result_snapshot_rows (snapshot_id, row_idx, row_key, row_json)
             VALUES (?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(idx as i64)
        .bind(&key)
        .bind(&row_json)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("insert snapshot row {}: {}", idx, e))?;
    }

    tx.commit()
        .await
        .map_err(|e| format!("commit snapshot: {}", e))?;

    Ok(SnapshotMeta {
        id,
        name: name.to_string(),
        connection_id: connection_id.to_string(),
        connection_name: connection_name.to_string(),
        sql_text: sql_text.to_string(),
        columns: columns.to_vec(),
        row_count,
        created_at,
    })
}

pub async fn list_result_snapshots(
    pool: &SqlitePool,
    limit: i64,
) -> Result<Vec<SnapshotMeta>, String> {
    ensure_snapshot_schema(pool).await?;
    let lim = limit.clamp(1, 500);
    let rows = sqlx::query(
        "SELECT id, name, connection_id, connection_name, sql_text, columns_json, row_count, created_at
         FROM result_snapshots
         ORDER BY created_at DESC
         LIMIT ?",
    )
    .bind(lim)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("list snapshots: {}", e))?;

    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        let columns_json: String = r.try_get("columns_json").map_err(|e| e.to_string())?;
        let columns: Vec<String> =
            serde_json::from_str(&columns_json).unwrap_or_default();
        out.push(SnapshotMeta {
            id: r.try_get("id").map_err(|e| e.to_string())?,
            name: r.try_get("name").map_err(|e| e.to_string())?,
            connection_id: r.try_get("connection_id").map_err(|e| e.to_string())?,
            connection_name: r.try_get("connection_name").map_err(|e| e.to_string())?,
            sql_text: r.try_get("sql_text").map_err(|e| e.to_string())?,
            columns,
            row_count: r.try_get("row_count").map_err(|e| e.to_string())?,
            created_at: r.try_get("created_at").map_err(|e| e.to_string())?,
        });
    }
    Ok(out)
}

pub async fn delete_result_snapshot(pool: &SqlitePool, id: &str) -> Result<(), String> {
    ensure_snapshot_schema(pool).await?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("begin delete: {}", e))?;
    sqlx::query("DELETE FROM result_snapshot_rows WHERE snapshot_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("delete rows: {}", e))?;
    sqlx::query("DELETE FROM result_snapshots WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("delete meta: {}", e))?;
    tx.commit()
        .await
        .map_err(|e| format!("commit delete: {}", e))?;
    Ok(())
}

async fn load_snapshot_map(
    pool: &SqlitePool,
    snapshot_id: &str,
) -> Result<(Vec<String>, HashMap<String, Vec<Value>>), String> {
    let meta = sqlx::query(
        "SELECT columns_json FROM result_snapshots WHERE id = ?",
    )
    .bind(snapshot_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Snapshot not found: {}", snapshot_id))?;

    let columns_json: String = meta.try_get("columns_json").map_err(|e| e.to_string())?;
    let columns: Vec<String> =
        serde_json::from_str(&columns_json).map_err(|e| format!("columns parse: {}", e))?;

    // Stream rows from SQLite into a map keyed by row_key.
    // For duplicate keys, last write wins for value but we track via full JSON equality on diff.
    let rows = sqlx::query(
        "SELECT row_key, row_json FROM result_snapshot_rows WHERE snapshot_id = ? ORDER BY row_idx",
    )
    .bind(snapshot_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("load rows: {}", e))?;

    let mut map: HashMap<String, Vec<Value>> = HashMap::with_capacity(rows.len());
    // Prefer stored row_key as-is (unique after save-time disambiguation).
    // If legacy rows share a key, append #n so nothing is dropped.
    let mut key_counts: HashMap<String, usize> = HashMap::new();
    for r in rows {
        let base_key: String = r.try_get("row_key").map_err(|e| e.to_string())?;
        let row_json: String = r.try_get("row_json").map_err(|e| e.to_string())?;
        let vals: Vec<Value> =
            serde_json::from_str(&row_json).map_err(|e| format!("row parse: {}", e))?;
        let n = key_counts.entry(base_key.clone()).or_insert(0);
        let key = if *n == 0 {
            base_key
        } else {
            format!("{}#{}", base_key, n)
        };
        *n += 1;
        map.insert(key, vals);
    }
    Ok((columns, map))
}

/// Diff two snapshots. Only non-unchanged rows are returned, paged by offset/limit.
pub async fn diff_result_snapshots(
    pool: &SqlitePool,
    left_id: &str,
    right_id: &str,
    offset: i64,
    limit: i64,
) -> Result<SnapshotDiffResult, String> {
    ensure_snapshot_schema(pool).await?;
    if left_id == right_id {
        return Err("Choose two different snapshots to compare".to_string());
    }

    let (_left_cols, left_map) = load_snapshot_map(pool, left_id).await?;
    let (_right_cols, right_map) = load_snapshot_map(pool, right_id).await?;

    let mut added: i64 = 0;
    let mut removed: i64 = 0;
    let mut changed: i64 = 0;
    let mut unchanged: i64 = 0;
    let mut all_diffs: Vec<SnapshotDiffRow> = Vec::new();

    // Keys only in left → removed; in both → changed or unchanged
    for (key, left_row) in &left_map {
        match right_map.get(key) {
            None => {
                removed += 1;
                all_diffs.push(SnapshotDiffRow {
                    kind: SnapshotDiffKind::Removed,
                    row_key: key.clone(),
                    left_row: Some(left_row.clone()),
                    right_row: None,
                });
            }
            Some(right_row) => {
                if left_row == right_row {
                    unchanged += 1;
                } else {
                    changed += 1;
                    all_diffs.push(SnapshotDiffRow {
                        kind: SnapshotDiffKind::Changed,
                        row_key: key.clone(),
                        left_row: Some(left_row.clone()),
                        right_row: Some(right_row.clone()),
                    });
                }
            }
        }
    }
    // Keys only in right → added
    for (key, right_row) in &right_map {
        if !left_map.contains_key(key) {
            added += 1;
            all_diffs.push(SnapshotDiffRow {
                kind: SnapshotDiffKind::Added,
                row_key: key.clone(),
                left_row: None,
                right_row: Some(right_row.clone()),
            });
        }
    }

    // Stable order: removed, changed, added; then by key
    all_diffs.sort_by(|a, b| {
        let rank = |k: &SnapshotDiffKind| match k {
            SnapshotDiffKind::Removed => 0,
            SnapshotDiffKind::Changed => 1,
            SnapshotDiffKind::Added => 2,
        };
        rank(&a.kind)
            .cmp(&rank(&b.kind))
            .then_with(|| a.row_key.cmp(&b.row_key))
    });

    let total_diff_rows = all_diffs.len() as i64;
    let off = offset.max(0) as usize;
    let lim = limit.clamp(1, 500) as usize;
    let page: Vec<SnapshotDiffRow> = all_diffs.into_iter().skip(off).take(lim).collect();

    Ok(SnapshotDiffResult {
        left_id: left_id.to_string(),
        right_id: right_id.to_string(),
        added,
        removed,
        changed,
        unchanged,
        rows: page,
        total_diff_rows,
        offset: offset.max(0),
        limit: lim as i64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn mem_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        ensure_snapshot_schema(&pool).await.unwrap();
        pool
    }

    #[test]
    fn test_row_key_uses_first_column() {
        let cols = vec!["id".into(), "name".into()];
        let row = vec![json!(42), json!("ada")];
        assert_eq!(compute_row_key(&cols, &row), "42");
    }

    #[tokio::test]
    async fn test_save_list_diff_delete() {
        let pool = mem_pool().await;
        let cols = vec!["id".into(), "name".into()];
        let left_rows = vec![
            vec![json!(1), json!("a")],
            vec![json!(2), json!("b")],
            vec![json!(3), json!("c")],
        ];
        let right_rows = vec![
            vec![json!(1), json!("a")],      // unchanged
            vec![json!(2), json!("b2")],     // changed
            vec![json!(4), json!("d")],      // added
        ];
        // id=3 removed

        let left = save_result_snapshot(
            &pool,
            "left",
            "c1",
            "conn",
            "SELECT * FROM t",
            &cols,
            &left_rows,
        )
        .await
        .unwrap();
        let right = save_result_snapshot(
            &pool,
            "right",
            "c1",
            "conn",
            "SELECT * FROM t",
            &cols,
            &right_rows,
        )
        .await
        .unwrap();

        let list = list_result_snapshots(&pool, 10).await.unwrap();
        assert_eq!(list.len(), 2);

        let diff = diff_result_snapshots(&pool, &left.id, &right.id, 0, 50)
            .await
            .unwrap();
        assert_eq!(diff.unchanged, 1);
        assert_eq!(diff.changed, 1);
        assert_eq!(diff.removed, 1);
        assert_eq!(diff.added, 1);
        assert_eq!(diff.total_diff_rows, 3);
        assert!(diff.rows.iter().any(|r| r.kind == SnapshotDiffKind::Changed));
        assert!(diff.rows.iter().any(|r| r.kind == SnapshotDiffKind::Added));
        assert!(diff.rows.iter().any(|r| r.kind == SnapshotDiffKind::Removed));

        // Paging: only 1 diff row
        let page = diff_result_snapshots(&pool, &left.id, &right.id, 0, 1)
            .await
            .unwrap();
        assert_eq!(page.rows.len(), 1);
        assert_eq!(page.total_diff_rows, 3);

        delete_result_snapshot(&pool, &left.id).await.unwrap();
        let list2 = list_result_snapshots(&pool, 10).await.unwrap();
        assert_eq!(list2.len(), 1);
        assert_eq!(list2[0].id, right.id);
    }

    #[tokio::test]
    async fn test_rejects_oversized_snapshot() {
        let pool = mem_pool().await;
        let cols = vec!["id".into()];
        let rows: Vec<Vec<Value>> = (0..(MAX_SNAPSHOT_ROWS + 1))
            .map(|i| vec![json!(i)])
            .collect();
        let err = save_result_snapshot(&pool, "big", "c", "c", "q", &cols, &rows)
            .await
            .unwrap_err();
        assert!(err.contains("too large"));
    }

    #[tokio::test]
    async fn test_diff_rejects_same_snapshot() {
        let pool = mem_pool().await;
        let cols = vec!["id".into()];
        let rows = vec![vec![json!(1)]];
        let s = save_result_snapshot(&pool, "s", "c", "c", "q", &cols, &rows)
            .await
            .unwrap();
        let err = diff_result_snapshots(&pool, &s.id, &s.id, 0, 10)
            .await
            .unwrap_err();
        assert!(err.to_lowercase().contains("different"));
    }

    #[tokio::test]
    async fn test_duplicate_first_column_keys_are_kept() {
        let pool = mem_pool().await;
        let cols = vec!["name".into(), "v".into()];
        let left = vec![
            vec![json!("x"), json!(1)],
            vec![json!("x"), json!(2)],
        ];
        let right = vec![
            vec![json!("x"), json!(1)],
            vec![json!("x"), json!(3)],
        ];
        let l = save_result_snapshot(&pool, "l", "c", "c", "q", &cols, &left)
            .await
            .unwrap();
        let r = save_result_snapshot(&pool, "r", "c", "c", "q", &cols, &right)
            .await
            .unwrap();
        let diff = diff_result_snapshots(&pool, &l.id, &r.id, 0, 50)
            .await
            .unwrap();
        // First "x" unchanged; second "x#1" changed
        assert_eq!(diff.unchanged, 1);
        assert_eq!(diff.changed, 1);
        assert_eq!(diff.added, 0);
        assert_eq!(diff.removed, 0);
    }

    #[tokio::test]
    async fn test_list_is_metadata_only_order() {
        let pool = mem_pool().await;
        let cols = vec!["id".into()];
        let a = save_result_snapshot(&pool, "first", "c", "c", "q", &cols, &[vec![json!(1)]])
            .await
            .unwrap();
        // tiny delay not needed; created_at is RFC3339 with same second possible —
        // just assert both appear and ids match.
        let b = save_result_snapshot(&pool, "second", "c", "c", "q", &cols, &[vec![json!(2)]])
            .await
            .unwrap();
        let list = list_result_snapshots(&pool, 10).await.unwrap();
        assert_eq!(list.len(), 2);
        // Newest first
        assert_eq!(list[0].id, b.id);
        assert_eq!(list[1].id, a.id);
        assert_eq!(list[0].row_count, 1);
        assert!(!list[0].columns.is_empty());
    }
}
