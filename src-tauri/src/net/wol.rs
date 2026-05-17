//! Wake-on-LAN: send a magic packet to a target MAC address.
//! Hand-rolls the WoL packet via tokio::net::UdpSocket; no third-party WoL crate.

use crate::net::NetError;
use serde::Serialize;
use std::net::SocketAddr;
use tokio::net::UdpSocket;

const DEFAULT_PORT: u16 = 9;
const DEFAULT_BROADCAST: &str = "255.255.255.255";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WolResult {
    pub sent: bool,
}

pub fn parse_mac(input: &str) -> Result<[u8; 6], NetError> {
    let cleaned: String = input.chars().filter(|c| !matches!(c, ':' | '-' | '.')).collect();
    if cleaned.len() != 12 {
        return Err(NetError::invalid(format!("MAC must be 12 hex digits, got {}", cleaned.len())));
    }
    let mut out = [0u8; 6];
    for i in 0..6 {
        out[i] = u8::from_str_radix(&cleaned[i * 2..i * 2 + 2], 16)
            .map_err(|_| NetError::invalid("MAC contains non-hex characters"))?;
    }
    Ok(out)
}

pub fn build_magic_packet(mac: [u8; 6]) -> Vec<u8> {
    let mut packet = Vec::with_capacity(102);
    packet.extend_from_slice(&[0xFFu8; 6]);
    for _ in 0..16 {
        packet.extend_from_slice(&mac);
    }
    packet
}

pub async fn wake(mac_input: &str, broadcast: Option<&str>, port: Option<u16>) -> Result<WolResult, NetError> {
    let mac = parse_mac(mac_input)?;
    let packet = build_magic_packet(mac);
    let dest_str = broadcast.unwrap_or(DEFAULT_BROADCAST);
    let dest_port = port.unwrap_or(DEFAULT_PORT);
    let dest: SocketAddr = format!("{}:{}", dest_str, dest_port)
        .parse()
        .map_err(|_| NetError::invalid(format!("invalid broadcast address: {}", dest_str)))?;

    let socket = UdpSocket::bind("0.0.0.0:0").await.map_err(|e| NetError::internal(e.to_string()))?;
    socket.set_broadcast(true).map_err(|e| NetError::internal(e.to_string()))?;
    socket.send_to(&packet, dest).await.map_err(|e| NetError::internal(e.to_string()))?;
    Ok(WolResult { sent: true })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_mac_colon_format() {
        assert_eq!(parse_mac("AA:BB:CC:DD:EE:FF").unwrap(), [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF]);
    }

    #[test]
    fn parse_mac_dash_format() {
        assert_eq!(parse_mac("aa-bb-cc-dd-ee-ff").unwrap(), [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF]);
    }

    #[test]
    fn parse_mac_no_separator() {
        assert_eq!(parse_mac("AABBCCDDEEFF").unwrap(), [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF]);
    }

    #[test]
    fn parse_mac_rejects_short() {
        assert!(matches!(parse_mac("AABB").unwrap_err(), NetError::InvalidArgument { .. }));
    }

    #[test]
    fn parse_mac_rejects_non_hex() {
        assert!(matches!(parse_mac("ZZ:BB:CC:DD:EE:FF").unwrap_err(), NetError::InvalidArgument { .. }));
    }

    #[test]
    fn magic_packet_layout() {
        let mac = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66];
        let pkt = build_magic_packet(mac);
        assert_eq!(pkt.len(), 102);
        assert_eq!(&pkt[0..6], &[0xFF; 6]);
        for i in 0..16 {
            assert_eq!(&pkt[6 + i * 6..6 + (i + 1) * 6], &mac);
        }
    }
}
