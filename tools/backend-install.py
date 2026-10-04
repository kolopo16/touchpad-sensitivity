#!/usr/bin/env python3
"""Install or remove the native backend without restarting GNOME Shell."""

import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

MARKER = '# Managed by touchpad-sensitivity\n'
LIBRARY_NAME = 'libtouchpad-sensitivity.so'
DROPIN_NAME = '90-touchpad-sensitivity.conf'
SHELL_UNIT = 'org.gnome.Shell@user.service'


def systemctl(*arguments):
    """Run against the desktop user's service manager, never the system manager."""
    return subprocess.run(
        ['systemctl', '--user', *arguments],
        check=True, capture_output=True, text=True,
    ).stdout


def check_preload_conflicts():
    environment = systemctl('show-environment')
    if any(line.startswith('LD_PRELOAD=') and line != 'LD_PRELOAD='
           for line in environment.splitlines()):
        raise SystemExit('An existing session LD_PRELOAD is configured. Remove that setup first.')
    for section in systemctl('cat', SHELL_UNIT).split('# /'):
        if 'LD_PRELOAD' in section and MARKER.strip() not in section:
            raise SystemExit('Another Shell service drop-in configures LD_PRELOAD; resolve it first.')


def atomic_write(destination, *, source=None, text=None, mode=0o644):
    """Rename into place; truncating a loaded shared library can crash Shell."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as temporary:
        path = Path(temporary.name)
    try:
        if source is not None:
            shutil.copyfile(source, path)
        else:
            path.write_text(text, encoding='utf-8')
        path.chmod(mode)
        path.replace(destination)
    finally:
        path.unlink(missing_ok=True)


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ('install', 'uninstall'):
        raise SystemExit('Usage: backend-install.py install|uninstall')
    if os.getuid() == 0:
        raise SystemExit('Run as your desktop user, without sudo.')

    action = sys.argv[1]
    data = Path(os.environ.get('XDG_DATA_HOME') or Path.home() / '.local/share')
    config = Path(os.environ.get('XDG_CONFIG_HOME') or Path.home() / '.config')
    if not data.is_absolute() or not config.is_absolute():
        raise SystemExit('XDG data/config directories must be absolute paths.')

    library = data / 'touchpad-sensitivity' / LIBRARY_NAME
    dropin = config / 'systemd/user/org.gnome.Shell@.service.d' / DROPIN_NAME
    if dropin.is_symlink() or (dropin.exists() and not dropin.read_text().startswith(MARKER)):
        raise SystemExit(f'Refusing to replace a file not managed by us: {dropin}')

    if action == 'uninstall':
        dropin.unlink(missing_ok=True)
        # Existing mappings remain valid until logout even after unlinking.
        library.unlink(missing_ok=True)
    else:
        if any(c.isspace() or c == ':' for c in str(library)):
            raise SystemExit('LD_PRELOAD requires an installation path without spaces or colons.')
        check_preload_conflicts()
        source = Path(__file__).resolve().parent.parent / 'build' / LIBRARY_NAME
        if not source.is_file():
            raise SystemExit('Build the native backend with make first.')
        atomic_write(library, source=source, mode=0o755)
        escaped = str(library).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%')
        atomic_write(dropin, text=f'{MARKER}[Service]\nEnvironment="LD_PRELOAD={escaped}"\n')

    systemctl('daemon-reload')
    print(f'Backend {action} complete. Log out and back in to finish.')


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr.strip() or str(error)) from error
    except OSError as error:
        raise SystemExit(str(error)) from error
