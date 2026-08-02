//! Native Redis Serialization Protocol (RESP) Client Engine for DevDash NoSQL Inspector
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisKeyInfo {
    pub key: String,
    pub key_type: String,
    pub ttl: i64,
    pub size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisValuePayload {
    pub key: String,
    pub key_type: String,
    pub ttl: i64,
    pub value: serde_json::Value,
}

/// Native Async RESP Protocol Encoder/Decoder over TCP
pub struct RedisClient {
    stream: BufReader<TcpStream>,
}

impl RedisClient {
    /// Connect to Redis host:port with optional password authentication
    pub async fn connect(host: &str, port: u16, password: Option<&str>) -> Result<Self, String> {
        let addr = format!("{}:{}", host, port);
        let stream = timeout(Duration::from_secs(5), TcpStream::connect(&addr))
            .await
            .map_err(|_| format!("Connection timeout to Redis instance at {}", addr))?
            .map_err(|e| format!("Failed to connect to Redis at {}: {}", addr, e))?;

        let mut client = Self {
            stream: BufReader::new(stream),
        };

        if let Some(pass) = password {
            if !pass.is_empty() {
                client.send_cmd(&["AUTH", pass]).await?;
            }
        }

        // Validate reachability with PING
        let pong = client.send_cmd(&["PING"]).await?;
        if !pong.to_uppercase().contains("PONG") && !pong.contains("OK") {
            return Err(format!("Redis PING failed, received: {}", pong));
        }

        Ok(client)
    }

    /// Send a RESP array command and return string representation of response
    pub async fn send_cmd(&mut self, args: &[&str]) -> Result<String, String> {
        let mut cmd = format!("*{}\r\n", args.len());
        for arg in args {
            cmd.push_str(&format!("${}\r\n{}\r\n", arg.len(), arg));
        }

        self.stream
            .write_all(cmd.as_bytes())
            .await
            .map_err(|e| format!("Write failed: {}", e))?;
        self.stream
            .flush()
            .await
            .map_err(|e| format!("Flush failed: {}", e))?;

        self.read_resp_response().await
    }

    async fn read_resp_response(&mut self) -> Result<String, String> {
        let mut line = String::new();
        self.stream
            .read_line(&mut line)
            .await
            .map_err(|e| format!("Read line failed: {}", e))?;

        if line.is_empty() {
            return Err("Empty response from Redis server".to_string());
        }

        let prefix = line.chars().next().unwrap_or(' ');
        let content = line[1..].trim_end_matches("\r\n");

        match prefix {
            '+' => Ok(content.to_string()),
            '-' => Err(format!("Redis Error: {}", content)),
            ':' => Ok(content.to_string()),
            '$' => {
                let len: i64 = content.parse().map_err(|_| "Invalid bulk string length")?;
                if len < 0 {
                    return Ok("nil".to_string());
                }
                let mut buf = vec![0u8; len as usize];
                self.stream
                    .read_exact(&mut buf)
                    .await
                    .map_err(|e| format!("Failed to read bulk string payload: {}", e))?;
                let mut crlf = [0u8; 2];
                let _ = self.stream.read_exact(&mut crlf).await;
                Ok(String::from_utf8_lossy(&buf).to_string())
            }
            '*' => {
                let count: i64 = content.parse().map_err(|_| "Invalid array count")?;
                if count < 0 {
                    return Ok("[]".to_string());
                }
                let mut items = Vec::new();
                for _ in 0..count {
                    let item = Box::pin(self.read_resp_response()).await?;
                    items.push(item);
                }
                Ok(format!("[{}]", items.join(", ")))
            }
            _ => Ok(content.to_string()),
        }
    }

    /// Scan and inspect active keys with data types and TTL metadata
    pub async fn fetch_keys(&mut self, pattern: &str) -> Result<Vec<RedisKeyInfo>, String> {
        let keys_str = self.send_cmd(&["KEYS", pattern]).await?;
        let clean = keys_str.trim_start_matches('[').trim_end_matches(']');
        if clean.is_empty() {
            return Ok(Vec::new());
        }

        let keys: Vec<&str> = clean.split(", ").map(|s| s.trim()).collect();
        let mut infos = Vec::new();

        for k in keys {
            if k.is_empty() {
                continue;
            }
            let key_type = self.send_cmd(&["TYPE", k]).await.unwrap_or_else(|_| "string".to_string());
            let ttl_str = self.send_cmd(&["TTL", k]).await.unwrap_or_else(|_| "-1".to_string());
            let ttl: i64 = ttl_str.parse().unwrap_or(-1);

            infos.push(RedisKeyInfo {
                key: k.to_string(),
                key_type,
                ttl,
                size: k.len() * 12,
            });
        }

        Ok(infos)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redis_key_info_struct() {
        let info = RedisKeyInfo {
            key: "session:app:100".to_string(),
            key_type: "hash".to_string(),
            ttl: 86400,
            size: 512,
        };
        assert_eq!(info.key, "session:app:100");
        assert_eq!(info.key_type, "hash");
        assert_eq!(info.ttl, 86400);
        assert_eq!(info.size, 512);
    }
}
