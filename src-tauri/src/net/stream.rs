//! Subscription registry mapping subscriptionId → CancellationToken.
//! Used by streaming network commands (ping, portScan, traceroute, snmpWalk).

use std::collections::HashMap;
use std::sync::Mutex;
use tokio_util::sync::CancellationToken;

/// Hard cap on total concurrent streaming subscriptions across the whole app.
/// Per-widget cap (5) is enforced separately by the frontend; this is a global
/// safety net inside the Rust process.
pub const GLOBAL_SUBSCRIPTION_CAP: usize = 50;

#[derive(Default)]
pub struct StreamRegistry {
    inner: Mutex<HashMap<String, CancellationToken>>,
}

impl StreamRegistry {
    pub fn new() -> Self {
        Self { inner: Mutex::new(HashMap::new()) }
    }

    /// Register a subscription. Returns Err if global cap exceeded or id duplicates an existing entry.
    pub fn register(&self, id: String) -> Result<CancellationToken, RegisterError> {
        let mut guard = self.inner.lock().expect("StreamRegistry mutex poisoned");
        if guard.len() >= GLOBAL_SUBSCRIPTION_CAP {
            return Err(RegisterError::CapacityExceeded);
        }
        if guard.contains_key(&id) {
            return Err(RegisterError::DuplicateId);
        }
        let token = CancellationToken::new();
        guard.insert(id, token.clone());
        Ok(token)
    }

    /// Cancel an active subscription. Silent no-op if id is unknown.
    pub fn cancel(&self, id: &str) {
        let guard = self.inner.lock().expect("StreamRegistry mutex poisoned");
        if let Some(token) = guard.get(id) {
            token.cancel();
        }
    }

    /// Remove a subscription after its stream task has fully completed.
    pub fn finish(&self, id: &str) {
        let mut guard = self.inner.lock().expect("StreamRegistry mutex poisoned");
        guard.remove(id);
    }

    #[cfg(test)]
    pub fn active_count(&self) -> usize {
        self.inner.lock().expect("StreamRegistry mutex poisoned").len()
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum RegisterError {
    CapacityExceeded,
    DuplicateId,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_returns_token_that_can_be_cancelled() {
        let reg = StreamRegistry::new();
        let token = reg.register("a".into()).unwrap();
        assert!(!token.is_cancelled());
        reg.cancel("a");
        assert!(token.is_cancelled());
    }

    #[test]
    fn cancel_unknown_id_is_no_op() {
        let reg = StreamRegistry::new();
        reg.cancel("does-not-exist"); // must not panic
    }

    #[test]
    fn finish_removes_entry() {
        let reg = StreamRegistry::new();
        let _ = reg.register("b".into()).unwrap();
        assert_eq!(reg.active_count(), 1);
        reg.finish("b");
        assert_eq!(reg.active_count(), 0);
    }

    #[test]
    fn double_register_same_id_is_error() {
        let reg = StreamRegistry::new();
        let _ = reg.register("c".into()).unwrap();
        assert_eq!(reg.register("c".into()).unwrap_err(), RegisterError::DuplicateId);
    }

    #[test]
    fn capacity_cap_enforced() {
        let reg = StreamRegistry::new();
        for i in 0..GLOBAL_SUBSCRIPTION_CAP {
            reg.register(format!("id-{}", i)).unwrap();
        }
        assert_eq!(
            reg.register("overflow".into()).unwrap_err(),
            RegisterError::CapacityExceeded
        );
    }
}
