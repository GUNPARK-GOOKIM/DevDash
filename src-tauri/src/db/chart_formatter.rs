// Query Result Chart Data Formatter module
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ColumnCategory {
    Numeric,
    Categorical,
    Temporal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SuggestedChartType {
    Bar,
    Line,
    Pie,
    Scatter,
    Table,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FormattedChartData {
    pub numeric_columns: Vec<String>,
    pub categorical_columns: Vec<String>,
    pub temporal_columns: Vec<String>,
    pub suggested_chart_type: SuggestedChartType,
    pub formatted_series: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInput {
    pub name: String,
    pub type_name: String,
}

pub fn format_query_result_for_chart(
    columns: &[ColumnInput],
    rows: &[Vec<Value>],
) -> FormattedChartData {
    let mut numeric_columns = Vec::new();
    let mut categorical_columns = Vec::new();
    let mut temporal_columns = Vec::new();

    for col in columns {
        let category = classify_column_type(&col.type_name);
        match category {
            ColumnCategory::Numeric => numeric_columns.push(col.name.clone()),
            ColumnCategory::Categorical => categorical_columns.push(col.name.clone()),
            ColumnCategory::Temporal => temporal_columns.push(col.name.clone()),
        }
    }

    let row_count = rows.len();
    let suggested_chart_type = match (
        numeric_columns.len(),
        categorical_columns.len(),
        temporal_columns.len(),
    ) {
        (n, _, t) if n >= 1 && t >= 1 => SuggestedChartType::Line,
        (1, c, 0) if c >= 1 && row_count <= 5 => SuggestedChartType::Pie,
        (n, c, 0) if n >= 1 && c >= 1 => SuggestedChartType::Bar,
        (n, 0, 0) if n >= 2 => SuggestedChartType::Scatter,
        _ => SuggestedChartType::Bar,
    };

    let mut formatted_series = Vec::new();
    for row in rows {
        let mut row_map = serde_json::Map::new();
        for (idx, col) in columns.iter().enumerate() {
            if let Some(val) = row.get(idx) {
                row_map.insert(col.name.clone(), val.clone());
            }
        }
        formatted_series.push(Value::Object(row_map));
    }

    FormattedChartData {
        numeric_columns,
        categorical_columns,
        temporal_columns,
        suggested_chart_type,
        formatted_series,
    }
}

fn classify_column_type(type_name: &str) -> ColumnCategory {
    let upper = type_name.to_uppercase();
    if upper.contains("INT")
        || upper.contains("FLOAT")
        || upper.contains("DOUBLE")
        || upper.contains("NUMERIC")
        || upper.contains("REAL")
        || upper.contains("DECIMAL")
        || upper.contains("NUMBER")
    {
        ColumnCategory::Numeric
    } else if upper.contains("DATE")
        || upper.contains("TIME")
        || upper.contains("TIMESTAMP")
        || upper.contains("YEAR")
    {
        ColumnCategory::Temporal
    } else {
        ColumnCategory::Categorical
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_format_query_result_for_chart_bar() {
        let cols = vec![
            ColumnInput {
                name: "department".to_string(),
                type_name: "VARCHAR".to_string(),
            },
            ColumnInput {
                name: "headcount".to_string(),
                type_name: "INTEGER".to_string(),
            },
        ];

        let rows = vec![
            vec![json!("Engineering"), json!(45)],
            vec![json!("Marketing"), json!(12)],
            vec![json!("Sales"), json!(30)],
            vec![json!("Support"), json!(18)],
            vec![json!("Design"), json!(8)],
            vec![json!("Finance"), json!(6)],
        ];

        let result = format_query_result_for_chart(&cols, &rows);
        assert_eq!(result.categorical_columns, vec!["department"]);
        assert_eq!(result.numeric_columns, vec!["headcount"]);
        assert_eq!(result.suggested_chart_type, SuggestedChartType::Bar);
        assert_eq!(result.formatted_series.len(), 6);
    }
}
