//! List network interfaces with addresses and CIDR via if-addrs 0.15.
//! MAC addresses are NOT exposed by if-addrs; if needed in the future,
//! integrate the `mac_address` crate. For now `mac` is always None.

use crate::net::NetError;
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceAddress {
    pub ip: String,
    pub family: &'static str, // "v4" or "v6"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cidr: Option<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetInterface {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mac: Option<String>,
    pub addresses: Vec<InterfaceAddress>,
    pub is_loopback: bool,
    pub is_up: bool,
}

pub fn list_interfaces() -> Result<Vec<NetInterface>, NetError> {
    let raw = if_addrs::get_if_addrs().map_err(|e| NetError::internal(e.to_string()))?;
    let mut grouped: HashMap<String, NetInterface> = HashMap::new();
    for iface in raw {
        let is_loopback = iface.is_loopback();
        let is_up = iface.is_oper_up();
        let name = iface.name.clone();
        let entry = grouped.entry(name.clone()).or_insert(NetInterface {
            name,
            mac: None,
            addresses: Vec::new(),
            is_loopback,
            is_up,
        });
        let (ip, family, cidr) = match &iface.addr {
            if_addrs::IfAddr::V4(v) => (v.ip.to_string(), "v4", cidr_from_mask_v4(v.netmask.octets())),
            if_addrs::IfAddr::V6(v) => (v.ip.to_string(), "v6", cidr_from_mask_v6(v.netmask.octets())),
        };
        entry.addresses.push(InterfaceAddress { ip, family, cidr: Some(cidr) });
        // If any address on this interface signals loopback / up, surface it.
        entry.is_loopback = entry.is_loopback || is_loopback;
        entry.is_up = entry.is_up || is_up;
    }
    let mut out: Vec<_> = grouped.into_values().collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

fn cidr_from_mask_v4(octets: [u8; 4]) -> u8 {
    octets.iter().map(|b| b.count_ones() as u8).sum()
}

fn cidr_from_mask_v6(octets: [u8; 16]) -> u8 {
    octets.iter().map(|b| b.count_ones() as u8).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_at_least_loopback() {
        let ifaces = list_interfaces().unwrap();
        assert!(ifaces.iter().any(|i| i.is_loopback), "expected at least one loopback interface");
    }

    #[test]
    fn cidr_v4_common_masks() {
        assert_eq!(cidr_from_mask_v4([255, 255, 255, 0]), 24);
        assert_eq!(cidr_from_mask_v4([255, 255, 0, 0]), 16);
        assert_eq!(cidr_from_mask_v4([0, 0, 0, 0]), 0);
    }

    #[test]
    fn cidr_v6_full_prefix() {
        let mut mask = [0u8; 16];
        for byte in mask.iter_mut().take(8) { *byte = 0xFF; }
        assert_eq!(cidr_from_mask_v6(mask), 64);
    }
}
