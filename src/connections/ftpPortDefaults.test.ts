import { ftpPortForProtocolSelection } from "./utils";

if (ftpPortForProtocolSelection("sftp", "") !== 22) {
  throw new Error("SFTP protocol selection should default to port 22.");
}

if (ftpPortForProtocolSelection("ftps", "", "implicit") !== 990) {
  throw new Error("Implicit FTPS protocol selection should default to port 990.");
}

if (ftpPortForProtocolSelection("ftp", "") !== 21) {
  throw new Error("Plain FTP protocol selection should default to port 21.");
}

if (ftpPortForProtocolSelection("sftp", "2022") !== 2022) {
  throw new Error("Explicit FTP ports should be preserved.");
}
