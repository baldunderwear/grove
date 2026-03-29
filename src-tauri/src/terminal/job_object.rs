//! Windows Job Object wrapper for process tree cleanup.
//!
//! When a terminal tab is closed, we need to kill not just the immediate cmd.exe
//! process but its entire process tree (claude, node, git, etc.). Windows Job
//! Objects with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` accomplish this: when the
//! last handle to the Job Object is closed, Windows terminates all processes
//! assigned to it.
//!
//! Handles are stored as `isize` in TerminalSession for Send safety. The raw
//! `HANDLE` (`*mut c_void`) is reconstructed from isize when needed.

#[cfg(windows)]
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
#[cfg(windows)]
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
#[cfg(windows)]
use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};

/// Convert an isize to a Windows HANDLE.
#[cfg(windows)]
#[inline]
fn to_handle(h: isize) -> HANDLE {
    h as HANDLE
}

/// Convert a Windows HANDLE to isize for safe storage in Send structs.
#[cfg(windows)]
#[inline]
fn from_handle(h: HANDLE) -> isize {
    h as isize
}

/// Create a nameless Job Object configured to kill all assigned processes when
/// the handle is closed.
///
/// Returns the Job Object handle as isize (for Send-safe storage in structs).
/// The caller owns this handle and must close it via `close_job_object`
/// (or let `TerminalSession::Drop` handle it).
#[cfg(windows)]
pub fn create_job_object() -> Result<isize, String> {
    // SAFETY: CreateJobObjectW with null security attributes and null name
    // creates a nameless job object. Returns null on failure.
    let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };

    if handle.is_null() || handle == INVALID_HANDLE_VALUE {
        return Err("CreateJobObjectW failed".to_string());
    }

    // Configure the job to kill all processes when the last handle is closed
    let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
    info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

    // SAFETY: We pass a valid job handle and correctly-sized struct.
    let result = unsafe {
        SetInformationJobObject(
            handle,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    };

    if result == 0 {
        // Clean up the handle before returning error
        unsafe { CloseHandle(handle) };
        return Err("SetInformationJobObject failed: could not set KILL_ON_JOB_CLOSE".to_string());
    }

    Ok(from_handle(handle))
}

/// Assign a process (by PID) to a Job Object. All child processes spawned by
/// the assigned process will also belong to the job.
///
/// Opens the process with minimal permissions (SET_QUOTA + TERMINATE), assigns
/// it, then closes the process handle.
#[cfg(windows)]
pub fn assign_process_to_job(job_handle: isize, pid: u32) -> Result<(), String> {
    let job = to_handle(job_handle);

    // SAFETY: OpenProcess with valid access flags and PID. Returns null on failure.
    let process_handle = unsafe { OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid) };

    if process_handle.is_null() {
        return Err(format!(
            "OpenProcess failed for PID {} (needed PROCESS_SET_QUOTA | PROCESS_TERMINATE)",
            pid
        ));
    }

    // SAFETY: Both handles are valid at this point. AssignProcessToJobObject
    // adds the process and all its future children to the job.
    let result = unsafe { AssignProcessToJobObject(job, process_handle) };

    // Always close the process handle -- the job holds its own reference
    unsafe { CloseHandle(process_handle) };

    if result == 0 {
        return Err(format!(
            "AssignProcessToJobObject failed for PID {}",
            pid
        ));
    }

    Ok(())
}

/// Close a Job Object handle, triggering KILL_ON_JOB_CLOSE which terminates
/// all processes assigned to the job.
#[cfg(windows)]
pub fn close_job_object(job_handle: isize) {
    let handle = to_handle(job_handle);
    if !handle.is_null() {
        // SAFETY: Caller guarantees this is a valid, non-closed handle.
        unsafe { CloseHandle(handle) };
    }
}
