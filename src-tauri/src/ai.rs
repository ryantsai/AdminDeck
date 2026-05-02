use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandProposalRequest {
    prompt: String,
    command: String,
    reason: String,
    context_label: String,
    selected_output: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandProposalPlan {
    prompt: String,
    command: String,
    reason: String,
    context_label: String,
    risk_label: String,
    approval_required: bool,
    extra_confirmation_required: bool,
    safety_notes: Vec<String>,
}

pub fn plan_command_proposal(
    request: CommandProposalRequest,
) -> Result<CommandProposalPlan, String> {
    let prompt = trim_required("proposal request", request.prompt)?;
    let command = trim_required("proposed command", request.command)?;
    let reason = trim_required("proposal reason", request.reason)?;
    let context_label = trim_required("proposal context", request.context_label)?;
    let selected_output = request
        .selected_output
        .map(|output| output.trim().to_string())
        .filter(|output| !output.is_empty());
    let safety = classify_command_safety(&command, selected_output.as_deref());

    Ok(CommandProposalPlan {
        prompt,
        command,
        reason,
        context_label,
        risk_label: if safety.extra_confirmation_required {
            "Extra confirmation".to_string()
        } else {
            "Approval required".to_string()
        },
        approval_required: true,
        extra_confirmation_required: safety.extra_confirmation_required,
        safety_notes: safety.notes,
    })
}

struct CommandSafety {
    extra_confirmation_required: bool,
    notes: Vec<String>,
}

fn classify_command_safety(command: &str, selected_output: Option<&str>) -> CommandSafety {
    let normalized = command.to_ascii_lowercase();
    let mut notes = Vec::new();
    let mut extra_confirmation_required = false;
    if selected_output.is_some() {
        notes.push(
            "Selected terminal output is included in the assistant context for this proposal."
                .to_string(),
        );
    }

    if contains_any(
        &normalized,
        &[
            "rm -rf",
            "remove-item",
            " rmdir ",
            " del ",
            " format ",
            "mkfs",
            "diskpart",
            "dd if=",
            "shutdown",
            "reboot",
        ],
    ) {
        extra_confirmation_required = true;
        notes.push("May delete, overwrite, reboot, or otherwise change system state.".to_string());
    }

    if contains_any(
        &normalized,
        &[
            "systemctl restart",
            "systemctl stop",
            "restart-service",
            "stop-service",
            "docker rm",
            "kubectl delete",
        ],
    ) {
        extra_confirmation_required = true;
        notes.push("May interrupt a service or running workload.".to_string());
    }

    if contains_any(
        &normalized,
        &[
            "password",
            "passwd",
            "secret",
            "token",
            "api_key",
            "apikey",
            "id_rsa",
            "id_ed25519",
            ".ssh",
        ],
    ) {
        extra_confirmation_required = true;
        notes.push("Mentions credentials, tokens, or SSH key material.".to_string());
    }

    if selected_output.is_some_and(mentions_sensitive_material) {
        extra_confirmation_required = true;
        notes.push(
            "Selected output may contain credentials, tokens, or SSH key material.".to_string(),
        );
    }

    if notes.is_empty() {
        notes.push(
            "Read-only or low-impact intent was detected, but approval is still required."
                .to_string(),
        );
    }

    CommandSafety {
        extra_confirmation_required,
        notes,
    }
}

fn contains_any(value: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| value.contains(needle))
}

fn mentions_sensitive_material(value: &str) -> bool {
    contains_any(
        &value.to_ascii_lowercase(),
        &[
            "password",
            "passwd",
            "secret",
            "token",
            "api_key",
            "apikey",
            "authorization:",
            "bearer ",
            "id_rsa",
            "id_ed25519",
            "-----begin",
        ],
    )
}

fn trim_required(label: &str, value: String) -> Result<String, String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        Err(format!("{label} is required"))
    } else {
        Ok(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_proposal_requires_non_empty_command() {
        let error = plan_command_proposal(CommandProposalRequest {
            prompt: "Check logs".to_string(),
            command: "   ".to_string(),
            reason: "Inspects recent errors.".to_string(),
            context_label: "Local - Terminal".to_string(),
            selected_output: None,
        })
        .expect_err("empty command is rejected");

        assert_eq!(error, "proposed command is required");
    }

    #[test]
    fn read_only_command_still_requires_approval_without_extra_confirmation() {
        let plan = plan_command_proposal(CommandProposalRequest {
            prompt: "Check disk pressure".to_string(),
            command: "Get-PSDrive -PSProvider FileSystem".to_string(),
            reason: "Reads local filesystem capacity.".to_string(),
            context_label: "PowerShell - Terminal".to_string(),
            selected_output: None,
        })
        .expect("proposal is planned");

        assert!(plan.approval_required);
        assert!(!plan.extra_confirmation_required);
        assert_eq!(plan.risk_label, "Approval required");
    }

    #[test]
    fn destructive_command_requires_extra_confirmation() {
        let plan = plan_command_proposal(CommandProposalRequest {
            prompt: "Clean build artifacts".to_string(),
            command: "rm -rf ./target".to_string(),
            reason: "Deletes build output.".to_string(),
            context_label: "Workspace - Terminal".to_string(),
            selected_output: None,
        })
        .expect("proposal is planned");

        assert!(plan.approval_required);
        assert!(plan.extra_confirmation_required);
        assert_eq!(plan.risk_label, "Extra confirmation");
    }

    #[test]
    fn credential_touching_command_requires_extra_confirmation() {
        let plan = plan_command_proposal(CommandProposalRequest {
            prompt: "Inspect SSH key permissions".to_string(),
            command: "ls -la ~/.ssh/id_ed25519".to_string(),
            reason: "Reads SSH key metadata.".to_string(),
            context_label: "Bastion - Terminal".to_string(),
            selected_output: None,
        })
        .expect("proposal is planned");

        assert!(plan.extra_confirmation_required);
        assert!(plan
            .safety_notes
            .iter()
            .any(|note| note.contains("credentials")));
    }

    #[test]
    fn selected_output_is_not_extra_confirmation_unless_sensitive() {
        let plan = plan_command_proposal(CommandProposalRequest {
            prompt: "Explain this output".to_string(),
            command: "Get-Content .\\service.log -Tail 50".to_string(),
            reason: "Reads a small log tail.".to_string(),
            context_label: "PowerShell - Terminal".to_string(),
            selected_output: Some("INFO service healthy".to_string()),
        })
        .expect("proposal is planned");

        assert!(!plan.extra_confirmation_required);
        assert!(plan
            .safety_notes
            .iter()
            .any(|note| note.contains("Selected terminal output")));
    }

    #[test]
    fn sensitive_selected_output_requires_extra_confirmation() {
        let plan = plan_command_proposal(CommandProposalRequest {
            prompt: "Explain this output".to_string(),
            command: "Get-Content .\\service.log -Tail 50".to_string(),
            reason: "Reads a small log tail.".to_string(),
            context_label: "PowerShell - Terminal".to_string(),
            selected_output: Some("Authorization: Bearer abc123".to_string()),
        })
        .expect("proposal is planned");

        assert!(plan.extra_confirmation_required);
        assert!(plan
            .safety_notes
            .iter()
            .any(|note| note.contains("Selected output may contain credentials")));
    }
}
