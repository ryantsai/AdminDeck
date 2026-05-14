use anyhow::{bail, ensure, Error};
use filedescriptor::{FileDescriptor, OwnedHandle, Pipe};
use lazy_static::lazy_static;
use portable_pty::{Child, ChildKiller, CommandBuilder, ExitStatus, MasterPty, PtySize};
use shared_library::shared_library;
use std::ffi::{OsStr, OsString};
use std::io::{Error as IoError, Read, Result as IoResult, Write};
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::os::windows::io::{AsRawHandle, FromRawHandle, RawHandle};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::{mem, ptr};
use winapi::shared::minwindef::DWORD;
use winapi::shared::winerror::{HRESULT, S_OK};
use winapi::um::handleapi::INVALID_HANDLE_VALUE;
use winapi::um::minwinbase::STILL_ACTIVE;
use winapi::um::processthreadsapi::{
    CreateProcessW, DeleteProcThreadAttributeList, GetExitCodeProcess, GetProcessId,
    InitializeProcThreadAttributeList, TerminateProcess, UpdateProcThreadAttribute,
    LPPROC_THREAD_ATTRIBUTE_LIST, PROCESS_INFORMATION,
};
use winapi::um::synchapi::WaitForSingleObject as WaitForSingleObjectSync;
use winapi::um::winbase::{
    CREATE_UNICODE_ENVIRONMENT, EXTENDED_STARTUPINFO_PRESENT, INFINITE,
    STARTF_USESTDHANDLES, STARTUPINFOEXW,
};
use winapi::um::wincon::COORD;
use winapi::um::winnt::HANDLE;

pub struct LocalWindowsPtySession {
    pub master: Box<dyn MasterPty + Send>,
    pub reader: Box<dyn Read + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child: Box<dyn Child + Send + Sync>,
}

pub fn spawn_local_shell(
    size: PtySize,
    command: CommandBuilder,
) -> Result<LocalWindowsPtySession, String> {
    let stdin = Pipe::new().map_err(|error| format!("failed to create ConPTY stdin pipe: {error}"))?;
    let stdout = Pipe::new().map_err(|error| format!("failed to create ConPTY stdout pipe: {error}"))?;
    let con = PsuedoCon::new(
        COORD {
            X: size.cols as i16,
            Y: size.rows as i16,
        },
        stdin.read,
        stdout.write,
    )
    .map_err(|error| format!("failed to create Windows pseudoconsole: {error}"))?;

    let master = WindowsConPtyMaster {
        inner: Arc::new(Mutex::new(Inner {
            con,
            readable: stdout.read,
            writable: Some(stdin.write),
            size,
        })),
    };
    let reader = master
        .try_clone_reader()
        .map_err(|error| format!("failed to create ConPTY reader: {error}"))?;
    let writer = master
        .take_writer()
        .map_err(|error| format!("failed to create ConPTY writer: {error}"))?;
    let slave = WindowsConPtySlave {
        inner: master.inner.clone(),
    };
    let child = slave
        .spawn_command(command)
        .map_err(|error| format!("failed to spawn local shell in ConPTY: {error}"))?;

    Ok(LocalWindowsPtySession {
        master: Box::new(master),
        reader,
        writer,
        child,
    })
}

shared_library!(ConPtyFuncs,
    pub fn CreatePseudoConsole(
        size: COORD,
        hInput: HANDLE,
        hOutput: HANDLE,
        flags: DWORD,
        hpc: *mut HPCON
    ) -> HRESULT,
    pub fn ResizePseudoConsole(hpc: HPCON, size: COORD) -> HRESULT,
    pub fn ClosePseudoConsole(hpc: HPCON),
);

pub type HPCON = HANDLE;

const PSEUDOCONSOLE_RESIZE_QUIRK: DWORD = 0x2;
const PSEUDOCONSOLE_WIN32_INPUT_MODE: DWORD = 0x4;
const PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE: usize = 0x00020016;

fn load_conpty() -> ConPtyFuncs {
    let kernel = ConPtyFuncs::open(Path::new("kernel32.dll")).expect(
        "this system does not support ConPTY. Windows 10 October 2018 or newer is required",
    );

    if let Ok(sideloaded) = ConPtyFuncs::open(Path::new("conpty.dll")) {
        sideloaded
    } else {
        kernel
    }
}

lazy_static! {
    static ref CONPTY: ConPtyFuncs = load_conpty();
}

struct ProcThreadAttributeList {
    data: Vec<u8>,
}

impl ProcThreadAttributeList {
    fn with_capacity(num_attributes: DWORD) -> Result<Self, Error> {
        let mut bytes_required: usize = 0;
        unsafe {
            InitializeProcThreadAttributeList(
                ptr::null_mut(),
                num_attributes,
                0,
                &mut bytes_required,
            )
        };
        let mut data = Vec::with_capacity(bytes_required);
        unsafe { data.set_len(bytes_required) };

        let attr_ptr = data.as_mut_slice().as_mut_ptr() as *mut _;
        let res = unsafe {
            InitializeProcThreadAttributeList(attr_ptr, num_attributes, 0, &mut bytes_required)
        };
        ensure!(
            res != 0,
            "InitializeProcThreadAttributeList failed: {}",
            IoError::last_os_error()
        );
        Ok(Self { data })
    }

    fn as_mut_ptr(&mut self) -> LPPROC_THREAD_ATTRIBUTE_LIST {
        self.data.as_mut_slice().as_mut_ptr() as *mut _
    }

    fn set_pty(&mut self, con: HPCON) -> Result<(), Error> {
        let res = unsafe {
            UpdateProcThreadAttribute(
                self.as_mut_ptr(),
                0,
                PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
                con,
                mem::size_of::<HPCON>(),
                ptr::null_mut(),
                ptr::null_mut(),
            )
        };
        ensure!(
            res != 0,
            "UpdateProcThreadAttribute failed: {}",
            IoError::last_os_error()
        );
        Ok(())
    }
}

impl Drop for ProcThreadAttributeList {
    fn drop(&mut self) {
        unsafe { DeleteProcThreadAttributeList(self.as_mut_ptr()) };
    }
}

struct PsuedoCon {
    con: HPCON,
}

unsafe impl Send for PsuedoCon {}
unsafe impl Sync for PsuedoCon {}

impl Drop for PsuedoCon {
    fn drop(&mut self) {
        unsafe { (CONPTY.ClosePseudoConsole)(self.con) };
    }
}

impl PsuedoCon {
    fn new(size: COORD, input: FileDescriptor, output: FileDescriptor) -> Result<Self, Error> {
        let mut con: HPCON = INVALID_HANDLE_VALUE;
        let result = unsafe {
            (CONPTY.CreatePseudoConsole)(
                size,
                input.as_raw_handle() as _,
                output.as_raw_handle() as _,
                // Do not request cursor inheritance. Microsoft documents that callers
                // must implement an async cursor-state handshake when this flag is set,
                // otherwise later pseudoconsole requests can hang.
                PSEUDOCONSOLE_RESIZE_QUIRK | PSEUDOCONSOLE_WIN32_INPUT_MODE,
                &mut con,
            )
        };
        ensure!(
            result == S_OK,
            "failed to create pseudoconsole: HRESULT {}",
            result
        );
        Ok(Self { con })
    }

    fn resize(&self, size: COORD) -> Result<(), Error> {
        let result = unsafe { (CONPTY.ResizePseudoConsole)(self.con, size) };
        ensure!(
            result == S_OK,
            "failed to resize console to {}x{}: HRESULT: {}",
            size.X,
            size.Y,
            result
        );
        Ok(())
    }

    fn spawn_command(&self, cmd: CommandBuilder) -> anyhow::Result<WindowsChild> {
        let mut si: STARTUPINFOEXW = unsafe { mem::zeroed() };
        si.StartupInfo.cb = mem::size_of::<STARTUPINFOEXW>() as u32;
        si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
        si.StartupInfo.hStdInput = INVALID_HANDLE_VALUE;
        si.StartupInfo.hStdOutput = INVALID_HANDLE_VALUE;
        si.StartupInfo.hStdError = INVALID_HANDLE_VALUE;

        let mut attrs = ProcThreadAttributeList::with_capacity(1)?;
        attrs.set_pty(self.con)?;
        si.lpAttributeList = attrs.as_mut_ptr();

        let mut pi: PROCESS_INFORMATION = unsafe { mem::zeroed() };

        let (mut exe, mut cmdline) = command_line(&cmd)?;
        let cmd_os = OsString::from_wide(&cmdline);
        let cwd = current_directory(&cmd);
        let mut environment_block = environment_block(&cmd);

        let res = unsafe {
            CreateProcessW(
                exe.as_mut_slice().as_mut_ptr(),
                cmdline.as_mut_slice().as_mut_ptr(),
                ptr::null_mut(),
                ptr::null_mut(),
                0,
                EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT,
                environment_block.as_mut_slice().as_mut_ptr() as *mut _,
                cwd.as_ref()
                    .map(|value| value.as_slice().as_ptr())
                    .unwrap_or(ptr::null()),
                &mut si.StartupInfo,
                &mut pi,
            )
        };
        if res == 0 {
            let err = IoError::last_os_error();
            let msg = format!(
                "CreateProcessW {cmd_os:?} in cwd {:?} failed: {err}",
                cwd.as_ref().map(|value| OsString::from_wide(value))
            );
            bail!(msg);
        }

        let _main_thread = unsafe { OwnedHandle::from_raw_handle(pi.hThread as _) };
        let proc = unsafe { OwnedHandle::from_raw_handle(pi.hProcess as _) };

        Ok(WindowsChild {
            proc: Mutex::new(proc),
        })
    }
}

struct Inner {
    con: PsuedoCon,
    readable: FileDescriptor,
    writable: Option<FileDescriptor>,
    size: PtySize,
}

impl Inner {
    fn resize(
        &mut self,
        num_rows: u16,
        num_cols: u16,
        pixel_width: u16,
        pixel_height: u16,
    ) -> Result<(), Error> {
        self.con.resize(COORD {
            X: num_cols as i16,
            Y: num_rows as i16,
        })?;
        self.size = PtySize {
            rows: num_rows,
            cols: num_cols,
            pixel_width,
            pixel_height,
        };
        Ok(())
    }
}

#[derive(Clone)]
struct WindowsConPtyMaster {
    inner: Arc<Mutex<Inner>>,
}

struct WindowsConPtySlave {
    inner: Arc<Mutex<Inner>>,
}

impl MasterPty for WindowsConPtyMaster {
    fn resize(&self, size: PtySize) -> anyhow::Result<()> {
        let mut inner = self.inner.lock().unwrap();
        inner.resize(size.rows, size.cols, size.pixel_width, size.pixel_height)
    }

    fn get_size(&self) -> Result<PtySize, Error> {
        let inner = self.inner.lock().unwrap();
        Ok(inner.size)
    }

    fn try_clone_reader(&self) -> anyhow::Result<Box<dyn Read + Send>> {
        Ok(Box::new(self.inner.lock().unwrap().readable.try_clone()?))
    }

    fn take_writer(&self) -> anyhow::Result<Box<dyn Write + Send>> {
        Ok(Box::new(
            self.inner
                .lock()
                .unwrap()
                .writable
                .take()
                .ok_or_else(|| anyhow::anyhow!("writer already taken"))?,
        ))
    }
}

impl WindowsConPtySlave {
    fn spawn_command(
        &self,
        cmd: CommandBuilder,
    ) -> anyhow::Result<Box<dyn Child + Send + Sync>> {
        let inner = self.inner.lock().unwrap();
        let child = inner.con.spawn_command(cmd)?;
        Ok(Box::new(child))
    }
}

#[derive(Debug)]
struct WindowsChild {
    proc: Mutex<OwnedHandle>,
}

impl WindowsChild {
    fn is_complete(&mut self) -> IoResult<Option<ExitStatus>> {
        let mut status: DWORD = 0;
        let proc = self.proc.lock().unwrap().try_clone().unwrap();
        let res = unsafe { GetExitCodeProcess(proc.as_raw_handle() as _, &mut status) };
        if res != 0 {
            if status == STILL_ACTIVE {
                Ok(None)
            } else {
                Ok(Some(ExitStatus::with_exit_code(status)))
            }
        } else {
            Ok(None)
        }
    }
}

impl ChildKiller for WindowsChild {
    fn kill(&mut self) -> IoResult<()> {
        let proc = self.proc.lock().unwrap().try_clone().unwrap();
        let res = unsafe { TerminateProcess(proc.as_raw_handle() as _, 1) };
        if res == 0 {
            Err(IoError::last_os_error())
        } else {
            Ok(())
        }
    }

    fn clone_killer(&self) -> Box<dyn ChildKiller + Send + Sync> {
        let proc = self.proc.lock().unwrap().try_clone().unwrap();
        Box::new(WindowsChildKiller { proc })
    }
}

#[derive(Debug)]
struct WindowsChildKiller {
    proc: OwnedHandle,
}

impl ChildKiller for WindowsChildKiller {
    fn kill(&mut self) -> IoResult<()> {
        let res = unsafe { TerminateProcess(self.proc.as_raw_handle() as _, 1) };
        if res == 0 {
            Err(IoError::last_os_error())
        } else {
            Ok(())
        }
    }

    fn clone_killer(&self) -> Box<dyn ChildKiller + Send + Sync> {
        let proc = self.proc.try_clone().unwrap();
        Box::new(WindowsChildKiller { proc })
    }
}

impl Child for WindowsChild {
    fn try_wait(&mut self) -> IoResult<Option<ExitStatus>> {
        self.is_complete()
    }

    fn wait(&mut self) -> IoResult<ExitStatus> {
        if let Ok(Some(status)) = self.try_wait() {
            return Ok(status);
        }
        let proc = self.proc.lock().unwrap().try_clone().unwrap();
        unsafe {
            WaitForSingleObjectSync(proc.as_raw_handle() as _, INFINITE);
        }
        let mut status: DWORD = 0;
        let res = unsafe { GetExitCodeProcess(proc.as_raw_handle() as _, &mut status) };
        if res != 0 {
            Ok(ExitStatus::with_exit_code(status))
        } else {
            Err(IoError::last_os_error())
        }
    }

    fn process_id(&self) -> Option<u32> {
        let res = unsafe { GetProcessId(self.proc.lock().unwrap().as_raw_handle() as _) };
        if res == 0 {
            None
        } else {
            Some(res)
        }
    }

    fn as_raw_handle(&self) -> Option<RawHandle> {
        Some(self.proc.lock().unwrap().as_raw_handle())
    }
}

fn command_line(cmd: &CommandBuilder) -> anyhow::Result<(Vec<u16>, Vec<u16>)> {
    let mut cmdline = Vec::<u16>::new();
    let argv = cmd.get_argv();
    let exe: OsString = if argv.is_empty() {
        cmd.get_env("ComSpec")
            .unwrap_or(OsStr::new("cmd.exe"))
            .into()
    } else {
        search_path(cmd, &argv[0])
    };

    append_quoted(&exe, &mut cmdline);

    let mut exe_wide: Vec<u16> = exe.encode_wide().collect();
    exe_wide.push(0);

    for arg in argv.iter().skip(1) {
        cmdline.push(' ' as u16);
        ensure!(
            !arg.encode_wide().any(|c| c == 0),
            "invalid encoding for command line argument {:?}",
            arg
        );
        append_quoted(arg, &mut cmdline);
    }
    cmdline.push(0);
    Ok((exe_wide, cmdline))
}

fn search_path(cmd: &CommandBuilder, exe: &OsStr) -> OsString {
    if let Some(path) = cmd.get_env("PATH") {
        let extensions = cmd.get_env("PATHEXT").unwrap_or(OsStr::new(".EXE"));
        for path in std::env::split_paths(path) {
            let candidate = path.join(exe);
            if candidate.exists() {
                return candidate.into_os_string();
            }

            for ext in std::env::split_paths(extensions) {
                let ext = ext.to_str().expect("PATHEXT entries must be utf8");
                let candidate = path.join(exe).with_extension(&ext[1..]);
                if candidate.exists() {
                    return candidate.into_os_string();
                }
            }
        }
    }

    exe.to_owned()
}

fn current_directory(cmd: &CommandBuilder) -> Option<Vec<u16>> {
    let home = cmd
        .get_env("USERPROFILE")
        .filter(|path| Path::new(path).is_dir());
    let cwd = cmd.get_cwd().map(|path| path.as_os_str()).filter(|path| Path::new(path).is_dir());
    let dir = cwd.or(home);

    dir.map(|dir| {
        let mut wide = vec![];
        if Path::new(dir).is_relative() {
            if let Ok(current_dir) = std::env::current_dir() {
                wide.extend(current_dir.join(dir).as_os_str().encode_wide());
            } else {
                wide.extend(dir.encode_wide());
            }
        } else {
            wide.extend(dir.encode_wide());
        }
        wide.push(0);
        wide
    })
}

fn environment_block(cmd: &CommandBuilder) -> Vec<u16> {
    let mut block = vec![];
    for (key, value) in cmd.iter_full_env_as_str() {
        block.extend(OsStr::new(key).encode_wide());
        block.push(b'=' as u16);
        block.extend(OsStr::new(value).encode_wide());
        block.push(0);
    }
    block.push(0);
    block
}

fn append_quoted(arg: &OsStr, cmdline: &mut Vec<u16>) {
    if !arg.is_empty()
        && !arg.encode_wide().any(|c| {
            c == ' ' as u16 || c == '\t' as u16 || c == '\n' as u16 || c == '\x0b' as u16 || c == '"' as u16
        })
    {
        cmdline.extend(arg.encode_wide());
        return;
    }
    cmdline.push('"' as u16);

    let arg: Vec<_> = arg.encode_wide().collect();
    let mut index = 0;
    while index < arg.len() {
        let mut num_backslashes = 0;
        while index < arg.len() && arg[index] == '\\' as u16 {
            index += 1;
            num_backslashes += 1;
        }

        if index == arg.len() {
            for _ in 0..num_backslashes * 2 {
                cmdline.push('\\' as u16);
            }
            break;
        } else if arg[index] == b'"' as u16 {
            for _ in 0..num_backslashes * 2 + 1 {
                cmdline.push('\\' as u16);
            }
            cmdline.push(arg[index]);
        } else {
            for _ in 0..num_backslashes {
                cmdline.push('\\' as u16);
            }
            cmdline.push(arg[index]);
        }
        index += 1;
    }
    cmdline.push('"' as u16);
}