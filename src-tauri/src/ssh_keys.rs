use crate::ssh;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};
use tauri::AppHandle;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateSshKeyPairRequest {
    email: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedSshKeyPair {
    private_key_path: String,
    public_key_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferSshPublicKeyRequest {
    host: String,
    port: Option<u16>,
    username: String,
    password: String,
    key_path: Option<String>,
    proxy_jump: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferSshPublicKeyResult {
    public_key_path: String,
}

pub fn generate_key_pair(
    request: GenerateSshKeyPairRequest,
) -> Result<GeneratedSshKeyPair, String> {
    let email = required_field("email", request.email)?;
    let ssh_folder = user_ssh_folder()?;
    fs::create_dir_all(&ssh_folder).map_err(|error| {
        format!(
            "failed to create SSH folder {}: {error}",
            ssh_folder.display()
        )
    })?;
    secure_path_for_current_user(&ssh_folder, true)?;

    let private_key_path = unique_private_key_path(&ssh_folder)?;
    let public_key_path = public_key_path_for(&private_key_path);

    let output = Command::new("ssh-keygen")
        .arg("-t")
        .arg("ed25519")
        .arg("-C")
        .arg(&email)
        .arg("-f")
        .arg(&private_key_path)
        .arg("-N")
        .arg("")
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("failed to run ssh-keygen: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "ssh-keygen failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    if !private_key_path.is_file() || !public_key_path.is_file() {
        return Err("ssh-keygen did not create the expected key files".to_string());
    }

    secure_path_for_current_user(&private_key_path, false)?;
    secure_path_for_current_user(&public_key_path, false)?;

    Ok(GeneratedSshKeyPair {
        private_key_path: private_key_path.to_string_lossy().into_owned(),
        public_key_path: public_key_path.to_string_lossy().into_owned(),
    })
}

pub fn transfer_public_key(
    app: AppHandle,
    request: TransferSshPublicKeyRequest,
) -> Result<TransferSshPublicKeyResult, String> {
    let host = required_field("host", request.host)?;
    let username = required_field("username", request.username)?;
    if request
        .proxy_jump
        .as_deref()
        .map(str::trim)
        .is_some_and(|value| !value.is_empty())
    {
        return Err("TransferSSH pub key does not support ProxyJump connections yet.".to_string());
    }
    let password = request.password;
    if password.is_empty() {
        return Err("password is required".to_string());
    }

    let public_key_path = public_key_path_from_optional_private_path(request.key_path)?;
    let public_key = fs::read_to_string(&public_key_path).map_err(|error| {
        format!(
            "failed to read SSH public key {}: {error}",
            public_key_path.display()
        )
    })?;
    let public_key = normalize_public_key(public_key)?;

    ssh::run_remote_command(ssh::NativeSshCommandRequest {
        host,
        user: username,
        port: request.port.unwrap_or(22),
        auth: ssh::NativeSshAuth::Password { password },
        known_hosts_path: ssh::app_known_hosts_path(&app)?,
        command: install_public_key_command(&public_key),
        timeout_seconds: Some(30),
    })?;

    Ok(TransferSshPublicKeyResult {
        public_key_path: public_key_path.to_string_lossy().into_owned(),
    })
}

fn user_ssh_folder() -> Result<PathBuf, String> {
    let profile =
        std::env::var_os("USERPROFILE").ok_or_else(|| "USERPROFILE is not set".to_string())?;
    Ok(PathBuf::from(profile).join(".ssh"))
}

fn unique_private_key_path(ssh_folder: &Path) -> Result<PathBuf, String> {
    let default_candidate = ssh_folder.join("id_ed25519");
    if !default_candidate.exists() && !public_key_path_for(&default_candidate).exists() {
        return Ok(default_candidate);
    }

    for _ in 0..128 {
        let mut random = [0_u8; 8];
        rand::thread_rng().fill_bytes(&mut random);
        let suffix = random
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let candidate = ssh_folder.join(format!("id_ed25519_admindeck_{suffix}"));
        if !candidate.exists() && !public_key_path_for(&candidate).exists() {
            return Ok(candidate);
        }
    }

    Err("failed to choose a unique SSH key filename".to_string())
}

fn public_key_path_for(private_key_path: &Path) -> PathBuf {
    let mut value = private_key_path.as_os_str().to_os_string();
    value.push(".pub");
    PathBuf::from(value)
}

fn public_key_path_from_optional_private_path(key_path: Option<String>) -> Result<PathBuf, String> {
    let key_path = key_path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or(user_ssh_folder()?.join("id_ed25519.pub"));

    let public_key_path = if key_path.extension().and_then(|value| value.to_str()) == Some("pub") {
        key_path
    } else {
        public_key_path_for(&key_path)
    };

    if !public_key_path.is_file() {
        return Err(format!(
            "SSH public key was not found at {}",
            public_key_path.display()
        ));
    }

    Ok(public_key_path)
}

fn normalize_public_key(public_key: String) -> Result<String, String> {
    let public_key = public_key.trim();
    if public_key.is_empty() {
        return Err("SSH public key is empty".to_string());
    }
    if public_key.contains('\n') || public_key.contains('\r') {
        return Err("SSH public key must be a single line".to_string());
    }
    if public_key.contains("PRIVATE KEY") {
        return Err("refusing to transfer an SSH private key".to_string());
    }
    if !public_key.starts_with("ssh-")
        && !public_key.starts_with("ecdsa-")
        && !public_key.starts_with("sk-")
    {
        return Err("selected file does not look like an SSH public key".to_string());
    }
    Ok(public_key.to_string())
}

fn install_public_key_command(public_key: &str) -> String {
    let quoted_key = shell_single_quote(public_key);
    format!(
        "umask 077; mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys && (grep -qxF {quoted_key} ~/.ssh/authorized_keys || printf '%s\\n' {quoted_key} >> ~/.ssh/authorized_keys)"
    )
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn required_field(label: &str, value: String) -> Result<String, String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        Err(format!("{label} is required"))
    } else {
        Ok(value)
    }
}

#[cfg(target_os = "windows")]
fn secure_path_for_current_user(path: &Path, is_directory: bool) -> Result<(), String> {
    let user = windows_current_user_acl_identity()?;
    let grant = windows_current_user_grant(&user, is_directory);
    let output = Command::new("icacls")
        .arg(path)
        .arg("/inheritance:r")
        .arg("/grant:r")
        .arg(grant)
        .arg("/remove:g")
        .arg("Users")
        .arg("Authenticated Users")
        .arg("Everyone")
        .output()
        .map_err(|error| {
            format!(
                "failed to secure NTFS permissions for {}: {error}",
                path.display()
            )
        })?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "failed to secure NTFS permissions for {}: {}",
            path.display(),
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

#[cfg(target_os = "windows")]
fn windows_current_user_acl_identity() -> Result<String, String> {
    let user_output = Command::new("whoami")
        .arg("/user")
        .arg("/fo")
        .arg("csv")
        .arg("/nh")
        .output()
        .map_err(|error| format!("failed to resolve current Windows user: {error}"))?;
    if !user_output.status.success() {
        return Err("failed to resolve current Windows user".to_string());
    }
    let sid = parse_whoami_user_sid(&String::from_utf8_lossy(&user_output.stdout))
        .ok_or_else(|| "failed to resolve current Windows user".to_string())?;
    Ok(format!("*{sid}"))
}

#[cfg(target_os = "windows")]
fn parse_whoami_user_sid(output: &str) -> Option<String> {
    output
        .lines()
        .find_map(|line| {
            let line = line.trim().trim_start_matches('\u{feff}');
            if line.is_empty() {
                return None;
            }
            line.rsplit_once(',')
                .map(|(_, sid)| sid.trim().trim_matches('"').to_string())
        })
        .filter(|sid| sid.starts_with("S-1-"))
}

#[cfg(target_os = "windows")]
fn windows_current_user_grant(user: &str, is_directory: bool) -> String {
    if is_directory {
        format!("{user}:(OI)(CI)F")
    } else {
        format!("{user}:(R,W)")
    }
}

#[cfg(not(target_os = "windows"))]
fn secure_path_for_current_user(path: &Path, is_directory: bool) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mode = if is_directory { 0o700 } else { 0o600 };
    fs::set_permissions(path, fs::Permissions::from_mode(mode)).map_err(|error| {
        format!(
            "failed to secure permissions for {}: {error}",
            path.display()
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_key_path_appends_pub_suffix() {
        assert_eq!(
            public_key_path_for(Path::new("C:\\Users\\ryan\\.ssh\\id_ed25519")),
            PathBuf::from("C:\\Users\\ryan\\.ssh\\id_ed25519.pub")
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn parses_whoami_csv_sid() {
        let output = "\"RYAN5080\\ryan\",\"S-1-5-21-111-222-333-1001\"\r\n";
        assert_eq!(
            parse_whoami_user_sid(output).as_deref(),
            Some("S-1-5-21-111-222-333-1001")
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn parses_whoami_csv_sid_with_utf8_bom() {
        let output = "\u{feff}\"RYAN5080\\ryan\",\"S-1-5-21-111-222-333-1001\"\r\n";
        assert_eq!(
            parse_whoami_user_sid(output).as_deref(),
            Some("S-1-5-21-111-222-333-1001")
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_file_grant_uses_parenthesized_permissions() {
        assert_eq!(
            windows_current_user_grant("*S-1-5-21-111-222-333-1001", false),
            "*S-1-5-21-111-222-333-1001:(R,W)"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_directory_grant_keeps_inheritable_full_control() {
        assert_eq!(
            windows_current_user_grant("*S-1-5-21-111-222-333-1001", true),
            "*S-1-5-21-111-222-333-1001:(OI)(CI)F"
        );
    }
}
