use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSshConfigRequest {
    content: String,
    folder_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigImportPreview {
    drafts: Vec<SshConfigConnectionDraft>,
    unsupported_directives: Vec<UnsupportedSshDirective>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigConnectionDraft {
    name: String,
    host: String,
    user: String,
    #[serde(rename = "type")]
    connection_type: &'static str,
    folder_id: Option<String>,
    port: Option<u16>,
    key_path: Option<String>,
    proxy_jump: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsupportedSshDirective {
    line: usize,
    host_pattern: Option<String>,
    directive: String,
    value: String,
}

#[derive(Default)]
struct HostBlock {
    patterns: Vec<String>,
    host_name: Option<String>,
    user: Option<String>,
    port: Option<u16>,
    key_path: Option<String>,
    proxy_jump: Option<String>,
}

pub fn import_ssh_config(
    request: ImportSshConfigRequest,
) -> Result<SshConfigImportPreview, String> {
    parse_ssh_config(&request.content, request.folder_id.as_deref())
}

fn parse_ssh_config(
    content: &str,
    folder_id: Option<&str>,
) -> Result<SshConfigImportPreview, String> {
    let mut unsupported_directives = Vec::new();
    let mut drafts = Vec::new();
    let mut current_block: Option<HostBlock> = None;
    let folder_id = folder_id
        .map(|folder_id| required_field("folder id", folder_id.to_string()))
        .transpose()?;

    for (line_index, raw_line) in content.lines().enumerate() {
        let line_number = line_index + 1;
        let line = strip_inline_comment(raw_line).trim().to_string();
        if line.is_empty() {
            continue;
        }

        let tokens = split_config_line(&line)?;
        if tokens.is_empty() {
            continue;
        }

        let directive = tokens[0].to_ascii_lowercase();
        let values = &tokens[1..];
        if directive == "host" {
            if let Some(block) = current_block.take() {
                drafts.extend(drafts_for_block(block, folder_id.as_deref()));
            }

            current_block = Some(HostBlock {
                patterns: values.to_vec(),
                ..HostBlock::default()
            });
            continue;
        }

        let Some(block) = current_block.as_mut() else {
            unsupported_directives.push(UnsupportedSshDirective {
                line: line_number,
                host_pattern: None,
                directive: tokens[0].clone(),
                value: values.join(" "),
            });
            continue;
        };

        match directive.as_str() {
            "hostname" => block.host_name = first_value(values),
            "user" => block.user = first_value(values),
            "identityfile" => block.key_path = first_value(values),
            "proxyjump" => block.proxy_jump = first_value(values),
            "port" => {
                if let Some(value) = values.first() {
                    block.port = Some(parse_port(value, line_number)?);
                }
            }
            _ => unsupported_directives.push(UnsupportedSshDirective {
                line: line_number,
                host_pattern: Some(block.patterns.join(" ")),
                directive: tokens[0].clone(),
                value: values.join(" "),
            }),
        }
    }

    if let Some(block) = current_block {
        drafts.extend(drafts_for_block(block, folder_id.as_deref()));
    }

    Ok(SshConfigImportPreview {
        drafts,
        unsupported_directives,
    })
}

fn drafts_for_block(block: HostBlock, folder_id: Option<&str>) -> Vec<SshConfigConnectionDraft> {
    block
        .patterns
        .iter()
        .filter(|pattern| is_importable_host_pattern(pattern))
        .map(|pattern| SshConfigConnectionDraft {
            name: pattern.to_string(),
            host: block
                .host_name
                .clone()
                .unwrap_or_else(|| pattern.to_string()),
            user: block.user.clone().unwrap_or_else(default_ssh_user),
            connection_type: "ssh",
            folder_id: folder_id.map(ToString::to_string),
            port: block.port,
            key_path: block.key_path.clone(),
            proxy_jump: block.proxy_jump.clone(),
        })
        .collect()
}

fn split_config_line(line: &str) -> Result<Vec<String>, String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;

    for character in line.chars() {
        match (quote, character) {
            (Some(active_quote), quote_character) if active_quote == quote_character => {
                quote = None;
            }
            (None, '"' | '\'') => quote = Some(character),
            (None, '=') if tokens.is_empty() => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            (None, whitespace) if whitespace.is_whitespace() => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(character),
        }
    }

    if quote.is_some() {
        return Err("SSH config line contains an unterminated quote".to_string());
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    Ok(tokens)
}

fn strip_inline_comment(line: &str) -> String {
    let mut quote: Option<char> = None;
    let mut previous_was_whitespace = true;
    let mut output = String::new();

    for character in line.chars() {
        match (quote, character) {
            (Some(active_quote), quote_character) if active_quote == quote_character => {
                quote = None;
                output.push(character);
            }
            (None, '"' | '\'') => {
                quote = Some(character);
                output.push(character);
            }
            (None, '#') if previous_was_whitespace => break,
            _ => {
                previous_was_whitespace = character.is_whitespace();
                output.push(character);
            }
        }
    }

    output
}

fn first_value(values: &[String]) -> Option<String> {
    values
        .first()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn parse_port(value: &str, line_number: usize) -> Result<u16, String> {
    value
        .parse::<u16>()
        .map_err(|_| format!("SSH config line {line_number} has an invalid port"))
}

fn is_importable_host_pattern(pattern: &str) -> bool {
    !pattern.contains('*') && !pattern.contains('?') && !pattern.starts_with('!')
}

fn default_ssh_user() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "local".to_string())
}

fn required_field(field: &str, value: String) -> Result<String, String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        Err(format!("{field} is required"))
    } else {
        Ok(trimmed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_supported_ssh_config_directives_as_connection_drafts() {
        let preview = parse_ssh_config(
            r#"
Host bastion-east
  HostName bastion-east.internal
  User admin
  Port 2222
  IdentityFile "C:\Users\ryan\.ssh\id_ed25519"
  ProxyJump jump.internal
"#,
            Some("imported"),
        )
        .expect("SSH config parses");

        assert_eq!(preview.drafts.len(), 1);
        assert_eq!(preview.drafts[0].name, "bastion-east");
        assert_eq!(preview.drafts[0].host, "bastion-east.internal");
        assert_eq!(preview.drafts[0].user, "admin");
        assert_eq!(preview.drafts[0].port, Some(2222));
        assert_eq!(
            preview.drafts[0].key_path.as_deref(),
            Some("C:\\Users\\ryan\\.ssh\\id_ed25519")
        );
        assert_eq!(
            preview.drafts[0].proxy_jump.as_deref(),
            Some("jump.internal")
        );
    }

    #[test]
    fn reports_unsupported_directives_without_blocking_supported_hosts() {
        let preview = parse_ssh_config(
            r#"
Include ~/.ssh/conf.d/*

Host api-stage *.internal
  HostName api-stage.internal
  User ops
  ForwardAgent yes
"#,
            None,
        )
        .expect("SSH config parses");

        assert_eq!(preview.drafts.len(), 1);
        assert_eq!(preview.drafts[0].name, "api-stage");
        assert_eq!(preview.unsupported_directives.len(), 2);
        assert_eq!(preview.unsupported_directives[0].directive, "Include");
        assert_eq!(preview.unsupported_directives[1].directive, "ForwardAgent");
        assert_eq!(
            preview.unsupported_directives[1].host_pattern.as_deref(),
            Some("api-stage *.internal")
        );
    }

    #[test]
    fn rejects_invalid_ports_with_line_context() {
        let error = parse_ssh_config(
            r#"
Host bad-port
  Port nope
"#,
            None,
        )
        .expect_err("invalid port is rejected");

        assert_eq!(error, "SSH config line 3 has an invalid port");
    }
}
