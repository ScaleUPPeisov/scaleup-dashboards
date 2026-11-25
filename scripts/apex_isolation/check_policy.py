"""Fail-closed parameter preparation for an offline Seatbelt experiment.

This module does not launch APEX. Disjoint paths and an OS profile alone do not
prove that WebKit/XPC helpers, inherited descriptors, or Publisher are isolated.
"""
import os
import pathlib
import stat


class PolicyError(ValueError):
    pass


def _directory_without_symlinks(path):
    p = pathlib.Path(path)
    if not p.is_absolute() or '..' in p.parts:
        raise PolicyError('INVALID_PATH')
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    fd = os.open('/', flags)
    try:
        for part in p.parts[1:]:
            next_fd = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        info = os.fstat(fd)
        # Pin and inspect the final directory; this does not detect every alias
        # or protect against a later change to an ancestor by another process.
        if not stat.S_ISDIR(info.st_mode):
            raise PolicyError('INVALID_DIRECTORY')
        return os.path.normpath(str(p)), info
    except OSError as exc:
        raise PolicyError('DIRECTORY_UNAVAILABLE') from exc
    finally:
        os.close(fd)


def prepare(private_root, media_roots):
    """Return sandbox-exec parameters only when all directories are disjoint.

    Every media root must be explicitly supplied and contain no symlink component.
    This check is not sufficient to launch an application and never does so.
    """
    if not media_roots:
        raise PolicyError('MEDIA_ROOTS_REQUIRED')
    private, info = _directory_without_symlinks(private_root)
    if info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise PolicyError('PRIVATE_ROOT_PERMISSIONS')
    for media_root in media_roots:
        media, _ = _directory_without_symlinks(media_root)
        if os.path.commonpath([private, media]) in (private, media):
            raise PolicyError('ROOTS_OVERLAP')
    return ['-D', 'PRIVATE_ROOT=' + private]
