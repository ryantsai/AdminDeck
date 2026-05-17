//! Network admin tools — shared types and module entry point.
//!
//! See docs/superpowers/specs/2026-05-17-network-tools-lego-blocks-design.md.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum NetError {
    Timeout,
    Refused,
    Unreachable,
    HostNotFound { reason: String },
    PermissionDenied { hint: String },
    InvalidArgument { reason: String },
    ResolverError { reason: String },
    Cancelled,
    ConcurrencyLimit,
    Internal { reason: String },
}

impl NetError {
    pub fn internal(msg: impl Into<String>) -> Self {
        Self::Internal { reason: msg.into() }
    }
    pub fn invalid(msg: impl Into<String>) -> Self {
        Self::InvalidArgument { reason: msg.into() }
    }
}

pub mod stream;
pub mod dns;
pub mod interfaces;
pub mod wol;
pub mod scan;
pub mod whois;
pub mod snmp;
pub mod ping;
pub mod traceroute;
pub mod commands;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn net_error_serializes_with_kind_tag() {
        let err = NetError::Timeout;
        let json = serde_json::to_string(&err).unwrap();
        assert_eq!(json, "{\"kind\":\"timeout\"}");
    }

    #[test]
    fn net_error_with_payload_serializes_camel_case() {
        let err = NetError::PermissionDenied {
            hint: "Run as administrator for ICMP.".into(),
        };
        let v: serde_json::Value = serde_json::from_str(&serde_json::to_string(&err).unwrap()).unwrap();
        assert_eq!(v["kind"], "permissionDenied");
        assert_eq!(v["hint"], "Run as administrator for ICMP.");
    }

    #[test]
    fn net_error_invalid_helper_works() {
        let err = NetError::invalid("bad input");
        match err {
            NetError::InvalidArgument { reason } => assert_eq!(reason, "bad input"),
            _ => panic!("expected InvalidArgument"),
        }
    }
}
