//! Pretty printers for CLI query results.
use crate::db::executor::QueryResultPayload;
use comfy_table::modifiers::UTF8_ROUND_CORNERS;
use comfy_table::presets::UTF8_FULL;
use comfy_table::{Cell, ContentArrangement, Table};
use serde_json::{json, Value};
use std::io::{self, Write};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OutputFormat {
    Table,
    Json,
    Csv,
    Tsv,
}

impl OutputFormat {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s.trim().to_lowercase().as_str() {
            "table" | "tab" => Ok(Self::Table),
            "json" => Ok(Self::Json),
            "csv" => Ok(Self::Csv),
            "tsv" => Ok(Self::Tsv),
            other => Err(format!(
                "Unknown format '{other}'. Use table, json, csv, or tsv."
            )),
        }
    }
}

pub fn cell_to_string(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        other => other.to_string(),
    }
}

pub fn render_payload(
    payload: &QueryResultPayload,
    format: OutputFormat,
    limit: Option<usize>,
    mut out: impl Write,
) -> io::Result<()> {
    let total = payload.rows.len();
    let rows: &[Vec<Value>] = match limit {
        Some(n) if n < total => &payload.rows[..n],
        _ => &payload.rows,
    };

    match format {
        OutputFormat::Table => {
            let mut table = Table::new();
            table
                .load_preset(UTF8_FULL)
                .apply_modifier(UTF8_ROUND_CORNERS)
                .set_content_arrangement(ContentArrangement::Dynamic);
            table.set_header(
                payload
                    .columns
                    .iter()
                    .map(|c| Cell::new(&c.name)),
            );
            for row in rows {
                table.add_row(row.iter().map(|v| {
                    let s = cell_to_string(v);
                    if s.len() > 80 {
                        Cell::new(format!("{}…", &s[..77]))
                    } else {
                        Cell::new(s)
                    }
                }));
            }
            writeln!(out, "{table}")?;
            writeln!(
                out,
                "({} row{}, {} ms{})",
                total,
                if total == 1 { "" } else { "s" },
                payload.execution_time_ms,
                match limit {
                    Some(n) if n < total => format!(", showing first {n}"),
                    _ => String::new(),
                }
            )?;
        }
        OutputFormat::Json => {
            let objects: Vec<Value> = rows
                .iter()
                .map(|row| {
                    let mut map = serde_json::Map::new();
                    for (i, col) in payload.columns.iter().enumerate() {
                        map.insert(
                            col.name.clone(),
                            row.get(i).cloned().unwrap_or(Value::Null),
                        );
                    }
                    Value::Object(map)
                })
                .collect();
            let wrapper = json!({
                "columns": payload.columns,
                "row_count": total,
                "execution_time_ms": payload.execution_time_ms,
                "affected_rows": payload.affected_rows,
                "rows": objects,
            });
            writeln!(out, "{}", serde_json::to_string_pretty(&wrapper).unwrap())?;
        }
        OutputFormat::Csv | OutputFormat::Tsv => {
            let sep = if format == OutputFormat::Csv { ',' } else { '\t' };
            let quote = format == OutputFormat::Csv;
            let headers: Vec<String> = payload.columns.iter().map(|c| c.name.clone()).collect();
            writeln!(out, "{}", join_row(&headers, sep, quote))?;
            for row in rows {
                let cells: Vec<String> = (0..payload.columns.len())
                    .map(|i| cell_to_string(row.get(i).unwrap_or(&Value::Null)))
                    .collect();
                writeln!(out, "{}", join_row(&cells, sep, quote))?;
            }
        }
    }
    Ok(())
}

fn join_row(cells: &[String], sep: char, quote: bool) -> String {
    cells
        .iter()
        .map(|c| {
            if !quote {
                return c.replace('\t', " ").replace('\n', " ");
            }
            if c.contains(sep) || c.contains('"') || c.contains('\n') {
                format!("\"{}\"", c.replace('"', "\"\""))
            } else {
                c.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(&sep.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::executor::ColumnHeader;

    fn sample() -> QueryResultPayload {
        QueryResultPayload {
            columns: vec![
                ColumnHeader {
                    name: "id".into(),
                    type_name: "INT".into(),
                },
                ColumnHeader {
                    name: "name".into(),
                    type_name: "TEXT".into(),
                },
            ],
            rows: vec![
                vec![json!(1), json!("ada")],
                vec![json!(2), json!("lin,us")],
            ],
            execution_time_ms: 3,
            affected_rows: 2,
        }
    }

    #[test]
    fn csv_quotes_commas() {
        let mut buf = Vec::new();
        render_payload(&sample(), OutputFormat::Csv, None, &mut buf).unwrap();
        let s = String::from_utf8(buf).unwrap();
        assert!(s.contains("id,name"));
        assert!(s.contains("\"lin,us\""));
    }

    #[test]
    fn json_includes_row_count() {
        let mut buf = Vec::new();
        render_payload(&sample(), OutputFormat::Json, Some(1), &mut buf).unwrap();
        let v: Value = serde_json::from_slice(&buf).unwrap();
        assert_eq!(v["row_count"], 2);
        assert_eq!(v["rows"].as_array().unwrap().len(), 1);
    }
}
