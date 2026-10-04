import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('installer', 'tools/backend-install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        # These tests only write to temporary directories, including in root CI containers.
        uid = patch.object(installer.os, 'getuid', return_value=1000)
        uid.start()
        self.addCleanup(uid.stop)

    def test_roundtrip_and_atomic_replacement(self):
        with tempfile.TemporaryDirectory() as root:
            data = Path(root) / 'data'
            config = Path(root) / 'config'
            with patch.dict(os.environ, {'XDG_DATA_HOME': str(data), 'XDG_CONFIG_HOME': str(config)}), \
                 patch.object(installer.subprocess, 'run', return_value=SimpleNamespace(stdout='')):
                with patch('sys.argv', ['installer', 'install']):
                    installer.main()
                    library = data / 'touchpad-sensitivity/libtouchpad-sensitivity.so'
                    with library.open('rb') as original:
                        inode = os.fstat(original.fileno()).st_ino
                        installer.main()
                        self.assertNotEqual(inode, library.stat().st_ino)
                        self.assertEqual(original.read(4), b'\x7fELF')
                dropin = config / 'systemd/user/org.gnome.Shell@.service.d/90-touchpad-sensitivity.conf'
                self.assertIn(str(library), dropin.read_text())
                with patch('sys.argv', ['installer', 'uninstall']):
                    installer.main()
                    installer.main()
                self.assertFalse(library.exists())
                self.assertFalse(dropin.exists())

    def test_existing_preload_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as root, \
             patch.dict(os.environ, {'XDG_DATA_HOME': root, 'XDG_CONFIG_HOME': root}), \
             patch.object(installer.subprocess, 'run', return_value=SimpleNamespace(stdout='LD_PRELOAD=/other.so\n')), \
             patch('sys.argv', ['installer', 'install']):
            with self.assertRaisesRegex(SystemExit, 'existing session LD_PRELOAD'):
                installer.main()
            self.assertFalse((Path(root) / 'touchpad-sensitivity').exists())

    def test_unmanaged_dropin_is_preserved(self):
        with tempfile.TemporaryDirectory() as root, \
             patch.dict(os.environ, {'XDG_DATA_HOME': root, 'XDG_CONFIG_HOME': root}), \
             patch('sys.argv', ['installer', 'install']):
            dropin = Path(root) / 'systemd/user/org.gnome.Shell@.service.d' / installer.DROPIN_NAME
            dropin.parent.mkdir(parents=True)
            dropin.write_text('[Service]\nEnvironment=EXAMPLE=1\n')
            with self.assertRaisesRegex(SystemExit, 'not managed by us'):
                installer.main()
            self.assertEqual(dropin.read_text(), '[Service]\nEnvironment=EXAMPLE=1\n')

    def test_uninstall_rejects_relative_directories(self):
        with patch.dict(os.environ, {'XDG_DATA_HOME': 'relative', 'XDG_CONFIG_HOME': 'relative'}), \
             patch('sys.argv', ['installer', 'uninstall']):
            with self.assertRaisesRegex(SystemExit, 'absolute paths'):
                installer.main()
