use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTransportPlan {
    primary_library: &'static str,
    sftp_candidate: &'static str,
    fallback_library: &'static str,
    system_ssh_role: &'static str,
}

pub fn transport_plan() -> SshTransportPlan {
    SshTransportPlan {
        primary_library: "russh",
        sftp_candidate: "russh-sftp",
        fallback_library: "ssh2",
        system_ssh_role: "debug-fallback",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn milestone_b_prefers_in_process_rust_ssh() {
        let plan = transport_plan();

        assert_eq!(plan.primary_library, "russh");
        assert_eq!(plan.sftp_candidate, "russh-sftp");
        assert_eq!(plan.fallback_library, "ssh2");
        assert_eq!(plan.system_ssh_role, "debug-fallback");
    }
}
