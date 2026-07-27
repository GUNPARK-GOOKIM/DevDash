// JSON Tree Viewer Module for parsing and structuring JSON cell values
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum JsonNodeType {
    Object,
    Array,
    String,
    Number,
    Boolean,
    Null,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct JsonTreeNode {
    pub key: String,
    pub node_type: JsonNodeType,
    pub value_summary: String,
    pub children: Vec<JsonTreeNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct JsonParseResult {
    pub is_valid: bool,
    pub root_type: JsonNodeType,
    pub tree: Option<JsonTreeNode>,
    pub raw_json: String,
    pub error: Option<String>,
}

pub fn parse_json_tree(json_str: &str) -> JsonParseResult {
    let trimmed = json_str.trim();
    if trimmed.is_empty() {
        return JsonParseResult {
            is_valid: false,
            root_type: JsonNodeType::Null,
            tree: None,
            raw_json: json_str.to_string(),
            error: Some("JSON string is empty".to_string()),
        };
    }

    match serde_json::from_str::<Value>(trimmed) {
        Ok(parsed_val) => {
            let root_node = build_tree_node("root", &parsed_val);
            JsonParseResult {
                is_valid: true,
                root_type: root_node.node_type.clone(),
                tree: Some(root_node),
                raw_json: serde_json::to_string_pretty(&parsed_val).unwrap_or_else(|_| json_str.to_string()),
                error: None,
            }
        }
        Err(err) => JsonParseResult {
            is_valid: false,
            root_type: JsonNodeType::Null,
            tree: None,
            raw_json: json_str.to_string(),
            error: Some(format!("Invalid JSON: {}", err)),
        },
    }
}

fn build_tree_node(key: &str, val: &Value) -> JsonTreeNode {
    match val {
        Value::Object(map) => {
            let children = map
                .iter()
                .map(|(k, v)| build_tree_node(k, v))
                .collect();
            JsonTreeNode {
                key: key.to_string(),
                node_type: JsonNodeType::Object,
                value_summary: format!("Object({} keys)", map.len()),
                children,
            }
        }
        Value::Array(arr) => {
            let children = arr
                .iter()
                .enumerate()
                .map(|(idx, v)| build_tree_node(&format!("[{}]", idx), v))
                .collect();
            JsonTreeNode {
                key: key.to_string(),
                node_type: JsonNodeType::Array,
                value_summary: format!("Array({} items)", arr.len()),
                children,
            }
        }
        Value::String(s) => JsonTreeNode {
            key: key.to_string(),
            node_type: JsonNodeType::String,
            value_summary: s.clone(),
            children: vec![],
        },
        Value::Number(n) => JsonTreeNode {
            key: key.to_string(),
            node_type: JsonNodeType::Number,
            value_summary: n.to_string(),
            children: vec![],
        },
        Value::Bool(b) => JsonTreeNode {
            key: key.to_string(),
            node_type: JsonNodeType::Boolean,
            value_summary: b.to_string(),
            children: vec![],
        },
        Value::Null => JsonTreeNode {
            key: key.to_string(),
            node_type: JsonNodeType::Null,
            value_summary: "null".to_string(),
            children: vec![],
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_nested_json_tree() {
        let raw = r#"{
            "user": "Akshat",
            "age": 28,
            "roles": ["admin", "dev"],
            "meta": { "level": "senior", "verified": true }
        }"#;

        let result = parse_json_tree(raw);
        assert!(result.is_valid);
        assert_eq!(result.root_type, JsonNodeType::Object);

        let tree = result.tree.unwrap();
        assert_eq!(tree.children.len(), 4);

        let roles_node = tree.children.iter().find(|c| c.key == "roles").unwrap();
        assert_eq!(roles_node.node_type, JsonNodeType::Array);
        assert_eq!(roles_node.children.len(), 2);
        assert_eq!(roles_node.children[0].value_summary, "admin");

        let meta_node = tree.children.iter().find(|c| c.key == "meta").unwrap();
        assert_eq!(meta_node.node_type, JsonNodeType::Object);
        assert_eq!(meta_node.children.len(), 2);
    }
}
