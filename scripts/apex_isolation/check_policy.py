"""Fail-closed parameter preparation for an offline Seatbelt experiment.

This module does not launch APEX. Disjoint paths and an OS profile alone do not
prove that WebKit/XPC helpers, inherited descriptors, or Publisher are isolated.
On macOS an inherited writable descriptor may remain writable after the profile
is applied. A future launcher must replace standard streams and close all other
descriptors *before* entering the sandbox. This module is not such a launcher.
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
        initial = os.fstat(fd)
        ancestry = {(initial.st_dev, initial.st_ino)}
        for part in p.parts[1:]:
            next_fd = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = next_fd
            current = os.fstat(fd)
            ancestry.add((current.st_dev, current.st_ino))
        info = os.fstat(fd)
        # Pin and inspect the final directory; this does not detect every alias
        # or protect against a later change to an ancestor by another process.
        if not stat.S_ISDIR(info.st_mode):
            raise PolicyError('INVALID_DIRECTORY')
        return os.path.normpath(str(p)), info, ancestry
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
    private, info, private_ancestry = _directory_without_symlinks(private_root)
    if private == '/':
        raise PolicyError('INVALID_PRIVATE_ROOT')
    if info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise PolicyError('PRIVATE_ROOT_PERMISSIONS')
    for media_root in media_roots:
        media, media_info, media_ancestry = _directory_without_symlinks(media_root)
        private_id = (info.st_dev, info.st_ino)
        media_id = (media_info.st_dev, media_info.st_ino)
        # Lexical comparison alone is unsafe on case-insensitive filesystems:
        # differently spelled paths may name the same directory. Compare the
        # identities of all opened ancestors as well.
        if (os.path.commonpath([private, media]) in (private, media)
                or private_id in media_ancestry or media_id in private_ancestry):
            raise PolicyError('ROOTS_OVERLAP')
    return ['-D', 'PRIVATE_ROOT=' + private]
