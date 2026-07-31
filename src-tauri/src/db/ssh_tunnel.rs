// Native SSH Tunnel forwarding engine for DevDash database client
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use ssh2::Session;
use std::io::{Read, Write};
use std::net::{TcpListener as StdTcpListener, TcpStream as StdTcpStream};
use std::path::Path;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

// Payload holding SSH configuration parameters
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SshConfigPayload {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: Option<String>,
    pub key_path: Option<String>,
    pub passphrase: Option<String>,
}

// Active SSH tunnel status descriptor
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SshTunnelStatus {
    pub connection_id: String,
    pub local_port: u16,
    pub target_host: String,
    pub target_port: u16,
    pub ssh_host: String,
    pub ssh_port: u16,
    pub active: bool,
}

// Thread-safe SSH Tunnel Manager
#[derive(Clone)]
pub struct SshTunnelManager {
    tunnels: Arc<DashMap<String, SshTunnelStatus>>,
}

impl Default for SshTunnelManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SshTunnelManager {
    pub fn new() -> Self {
        Self {
            tunnels: Arc::new(DashMap::new()),
        }
    }

    // Allocate an OS-assigned free local port on 127.0.0.1
    pub fn find_free_local_port() -> Result<u16, String> {
        let listener = StdTcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("Failed to bind local port for SSH tunnel: {}", e))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("Failed to read local port address: {}", e))?
            .port();
        drop(listener);
        Ok(port)
    }

    // Test SSH authentication and bastion server reachability
    pub fn test_ssh_connection(config: &SshConfigPayload) -> Result<u64, String> {
        if !config.enabled {
            return Err("SSH tunnel is disabled in configuration".to_string());
        }

        let start = std::time::Instant::now();
        let tcp_addr = format!("{}:{}", config.host, config.port);
        let tcp = StdTcpStream::connect_timeout(
            &tcp_addr.parse().map_err(|e| format!("Invalid SSH address {}: {}", tcp_addr, e))?,
            Duration::from_secs(5),
        )
        .map_err(|e| format!("Failed to reach SSH server {}: {}", tcp_addr, e))?;

        let mut sess = Session::new().map_err(|e| format!("Failed to create SSH session: {}", e))?;
        sess.set_tcp_stream(tcp);
        sess.handshake()
            .map_err(|e| format!("SSH handshake with {} failed: {}", config.host, e))?;

        // Authenticate via public key file, password, or SSH agent
        let mut authed = false;

        if let Some(key_path_str) = &config.key_path {
            let key_path = Path::new(key_path_str);
            if key_path.exists() {
                let passphrase = config.passphrase.as_deref();
                if sess
                    .userauth_pubkey_file(&config.user, None, key_path, passphrase)
                    .is_ok()
                {
                    authed = true;
                }
            }
        }

        if !authed {
            if let Some(pass) = &config.password {
                if sess.userauth_password(&config.user, pass).is_ok() {
                    authed = true;
                }
            }
        }

        if !authed && sess.userauth_agent(&config.user).is_ok() {
            authed = true;
        }

        if !authed {
            return Err(format!(
                "SSH authentication failed for user '{}' on {}:{}",
                config.user, config.host, config.port
            ));
        }

        let elapsed = start.elapsed().as_millis() as u64;
        Ok(elapsed)
    }

    // Establish local port forwarding tunnel to remote target host:port
    pub fn open_tunnel(
        &self,
        connection_id: &str,
        ssh_config: &SshConfigPayload,
        target_host: &str,
        target_port: u16,
    ) -> Result<u16, String> {
        let local_port = Self::find_free_local_port()?;

        let status = SshTunnelStatus {
            connection_id: connection_id.to_string(),
            local_port,
            target_host: target_host.to_string(),
            target_port,
            ssh_host: ssh_config.host.clone(),
            ssh_port: ssh_config.port,
            active: true,
        };

        self.tunnels.insert(connection_id.to_string(), status);

        // Spawn background thread to accept local connections and forward over SSH direct-tcpip channel
        let ssh_cfg = ssh_config.clone();
        let target_h = target_host.to_string();
        let conn_id = connection_id.to_string();

        thread::spawn(move || {
            let local_addr = format!("127.0.0.1:{}", local_port);
            let listener = match StdTcpListener::bind(&local_addr) {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("SSH local listener bind error for connection {}: {}", conn_id, e);
                    return;
                }
            };

            for stream_res in listener.incoming() {
                let local_stream = match stream_res {
                    Ok(s) => s,
                    Err(_) => break,
                };

                // Connect to SSH bastion host
                let ssh_addr = format!("{}:{}", ssh_cfg.host, ssh_cfg.port);
                let tcp = match StdTcpStream::connect(&ssh_addr) {
                    Ok(t) => t,
                    Err(e) => {
                        eprintln!("SSH tunnel connect error to {}: {}", ssh_addr, e);
                        continue;
                    }
                };

                let mut sess = match Session::new() {
                    Ok(s) => s,
                    Err(_) => continue,
                };
                sess.set_tcp_stream(tcp);
                if sess.handshake().is_err() {
                    continue;
                }

                // Authenticate
                let mut authed = false;
                if let Some(kp) = &ssh_cfg.key_path {
                    let path = Path::new(kp);
                    if path.exists()
                        && sess
                            .userauth_pubkey_file(&ssh_cfg.user, None, path, ssh_cfg.passphrase.as_deref())
                            .is_ok()
                    {
                        authed = true;
                    }
                }
                if !authed {
                    if let Some(pass) = &ssh_cfg.password {
                        if sess.userauth_password(&ssh_cfg.user, pass).is_ok() {
                            authed = true;
                        }
                    }
                }
                if !authed {
                    let _ = sess.userauth_agent(&ssh_cfg.user);
                }

                // Open direct tcpip channel
                let mut channel = match sess.channel_direct_tcpip(&target_h, target_port, None) {
                    Ok(c) => c,
                    Err(e) => {
                        eprintln!(
                            "Failed to open direct-tcpip channel to {}:{}: {}",
                            target_h, target_port, e
                        );
                        continue;
                    }
                };

                // Bidirectional copy: local <-> SSH channel
                let mut local_to_remote = match local_stream.try_clone() {
                    Ok(c) => c,
                    Err(_) => continue,
                };
                let mut remote_to_local = match local_stream.try_clone() {
                    Ok(c) => c,
                    Err(_) => continue,
                };

                // local → remote
                let mut channel_writer = channel.stream(0);
                thread::spawn(move || {
                    let mut buf = [0u8; 16384];
                    loop {
                        let n = match local_to_remote.read(&mut buf) {
                            Ok(0) | Err(_) => break,
                            Ok(n) => n,
                        };
                        if channel_writer.write_all(&buf[..n]).is_err() {
                            break;
                        }
                        let _ = channel_writer.flush();
                    }
                });

                // remote → local (on this thread so the Session/Channel stay alive)
                {
                    let mut buf = [0u8; 16384];
                    let mut channel_reader = channel.stream(0);
                    loop {
                        let n = match channel_reader.read(&mut buf) {
                            Ok(0) | Err(_) => break,
                            Ok(n) => n,
                        };
                        if remote_to_local.write_all(&buf[..n]).is_err() {
                            break;
                        }
                        let _ = remote_to_local.flush();
                    }
                }
                let _ = channel.wait_close();
            }
        });

        Ok(local_port)
    }

    pub fn get_tunnel_status(&self, connection_id: &str) -> Option<SshTunnelStatus> {
        self.tunnels.get(connection_id).map(|r| r.value().clone())
    }

    pub fn close_tunnel(&self, connection_id: &str) -> Result<(), String> {
        if let Some((_, mut status)) = self.tunnels.remove(connection_id) {
            status.active = false;
        }
        Ok(())
    }
}
