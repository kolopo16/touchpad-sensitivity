import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Backend} from '../backend.js';

const runtime = GLib.get_user_runtime_dir();
const backend = new Backend();
try {
    if (backend.isLoaded())
        throw new Error('Test process unexpectedly has a native backend loaded');
    backend.apply(0.5);
    const [, stat] = GLib.file_get_contents('/proc/self/stat');
    const pid = new TextDecoder().decode(stat).split(' ')[0];
    const path = `${runtime}/touchpad-sensitivity-${pid}.control`;
    const [, data] = GLib.file_get_contents(path);
    const text = new TextDecoder().decode(data);
    if (!/^v1 \d+ 50\n$/.test(text)) throw new Error(`Invalid backend control protocol: ${text}`);
    const info = Gio.File.new_for_path(path).query_info(
        'unix::mode',
        Gio.FileQueryInfoFlags.NONE,
        null,
    );
    if ((info.get_attribute_uint32('unix::mode') & 0o777) !== 0o600)
        throw new Error('Control file is not private');
    backend.apply(2);
    backend.stop();
    if (GLib.file_test(path, GLib.FileTest.EXISTS))
        throw new Error('Control file persisted after stop');
    backend.stop();
    print('GJS backend: detection, protocol, permissions, atomic update and disable passed.');
} finally {
    backend.stop();
}
