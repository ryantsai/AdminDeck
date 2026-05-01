use keyring_core::{Entry, Error};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

const SERVICE_NAME: &str = "com.admindeck.app";

pub struct Secrets {
    backend: Option<String>,
    init_error: Option<String>,
    operation_lock: Mutex<()>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KeychainStatus {
    available: bool,
    service: &'static str,
    backend: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreSecretRequest {
    kind: SecretKind,
    owner_id: String,
    secret: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretReferenceRequest {
    kind: SecretKind,
    owner_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretPresence {
    exists: bool,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum SecretKind {
    ConnectionPassword,
    ConnectionPassphrase,
    AiApiKey,
}

impl Secrets {
    pub fn new() -> Self {
        match configure_default_store() {
            Ok(backend) => Self {
                backend: Some(backend),
                init_error: None,
                operation_lock: Mutex::new(()),
            },
            Err(error) => Self {
                backend: None,
                init_error: Some(error),
                operation_lock: Mutex::new(()),
            },
        }
    }

    pub fn status(&self) -> KeychainStatus {
        KeychainStatus {
            available: self.backend.is_some(),
            service: SERVICE_NAME,
            backend: self
                .backend
                .clone()
                .or_else(|| self.init_error.clone())
                .unwrap_or_else(|| "OS keychain unavailable".to_string()),
        }
    }

    pub fn store_secret(&self, request: StoreSecretRequest) -> Result<(), String> {
        let reference = SecretReference::new(request.kind, request.owner_id)?;
        let secret = request.secret;
        if secret.is_empty() {
            return Err("secret value is required".to_string());
        }

        let _guard = self.lock()?;
        self.entry(&reference)?
            .set_password(&secret)
            .map_err(to_secret_error)
    }

    pub fn secret_exists(&self, request: SecretReferenceRequest) -> Result<SecretPresence, String> {
        let reference = SecretReference::new(request.kind, request.owner_id)?;
        let _guard = self.lock()?;

        match self.entry(&reference)?.get_password() {
            Ok(_) => Ok(SecretPresence { exists: true }),
            Err(Error::NoEntry) => Ok(SecretPresence { exists: false }),
            Err(error) => Err(to_secret_error(error)),
        }
    }

    pub fn delete_secret(&self, request: SecretReferenceRequest) -> Result<(), String> {
        let reference = SecretReference::new(request.kind, request.owner_id)?;
        let _guard = self.lock()?;

        match self.entry(&reference)?.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(error) => Err(to_secret_error(error)),
        }
    }

    #[allow(dead_code)]
    pub(crate) fn read_secret(
        &self,
        request: SecretReferenceRequest,
    ) -> Result<Option<String>, String> {
        let reference = SecretReference::new(request.kind, request.owner_id)?;
        let _guard = self.lock()?;

        match self.entry(&reference)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(Error::NoEntry) => Ok(None),
            Err(error) => Err(to_secret_error(error)),
        }
    }

    fn entry(&self, reference: &SecretReference) -> Result<Entry, String> {
        if self.backend.is_none() {
            return Err(self
                .init_error
                .clone()
                .unwrap_or_else(|| "OS keychain is unavailable".to_string()));
        }

        Entry::new(SERVICE_NAME, &reference.key()).map_err(to_secret_error)
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, ()>, String> {
        self.operation_lock
            .lock()
            .map_err(|_| "keychain operation lock is poisoned".to_string())
    }

    #[cfg(test)]
    fn new_for_test() -> Self {
        keyring_core::set_default_store(keyring_core::mock::Store::new().expect("mock store"));
        Self {
            backend: Some("Mock keychain".to_string()),
            init_error: None,
            operation_lock: Mutex::new(()),
        }
    }
}

struct SecretReference {
    kind: SecretKind,
    owner_id: String,
}

impl SecretReference {
    fn new(kind: SecretKind, owner_id: String) -> Result<Self, String> {
        let owner_id = owner_id.trim().to_string();
        if owner_id.is_empty() {
            return Err("secret owner id is required".to_string());
        }
        if owner_id.len() > 128 {
            return Err("secret owner id must be 128 characters or fewer".to_string());
        }
        if owner_id.chars().any(char::is_control) {
            return Err("secret owner id cannot contain control characters".to_string());
        }

        Ok(Self { kind, owner_id })
    }

    fn key(&self) -> String {
        format!("{}:{}", self.kind.as_key(), self.owner_id)
    }
}

impl SecretKind {
    fn as_key(self) -> &'static str {
        match self {
            Self::ConnectionPassword => "connection-password",
            Self::ConnectionPassphrase => "connection-passphrase",
            Self::AiApiKey => "ai-api-key",
        }
    }
}

#[cfg(target_os = "windows")]
fn configure_default_store() -> Result<String, String> {
    keyring_core::set_default_store(
        windows_native_keyring_store::Store::new().map_err(to_secret_error)?,
    );
    Ok("Windows Credential Manager".to_string())
}

#[cfg(not(target_os = "windows"))]
fn configure_default_store() -> Result<String, String> {
    Err("OS keychain backend is not configured for this platform yet".to_string())
}

fn to_secret_error(error: Error) -> String {
    format!("OS keychain error: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_checks_reads_and_deletes_secret_without_sqlite() {
        let secrets = Secrets::new_for_test();
        let owner_id = "connection-test-secret".to_string();

        secrets
            .store_secret(StoreSecretRequest {
                kind: SecretKind::ConnectionPassword,
                owner_id: owner_id.clone(),
                secret: "not-for-sqlite".to_string(),
            })
            .expect("secret is stored");

        let presence = secrets
            .secret_exists(SecretReferenceRequest {
                kind: SecretKind::ConnectionPassword,
                owner_id: owner_id.clone(),
            })
            .expect("presence check succeeds");
        assert!(presence.exists);

        let secret = secrets
            .read_secret(SecretReferenceRequest {
                kind: SecretKind::ConnectionPassword,
                owner_id: owner_id.clone(),
            })
            .expect("secret can be read by backend");
        assert_eq!(secret.as_deref(), Some("not-for-sqlite"));

        secrets
            .delete_secret(SecretReferenceRequest {
                kind: SecretKind::ConnectionPassword,
                owner_id,
            })
            .expect("secret is deleted");
    }
}
