import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class Backend {
    constructor() {
        const [, stat] = GLib.file_get_contents('/proc/self/stat');
        const pid = new TextDecoder().decode(stat).split(' ')[0];
        this._file = Gio.File.new_for_path(
            GLib.build_filenamev([
                GLib.get_user_runtime_dir(),
                `touchpad-sensitivity-${pid}.control`,
            ]),
        );
        // The preload can only change when Shell restarts; inspect it once.
        const [, maps] = GLib.file_get_contents('/proc/self/maps');
        this._loaded = /\/libtouchpad-sensitivity\.so(?:\s|$)/m.test(
            new TextDecoder().decode(maps),
        );
    }

    isLoaded() {
        return this._loaded;
    }

    apply(factor) {
        const data = new TextEncoder().encode(
            `v1 ${GLib.get_monotonic_time()} ${Math.round(factor * 100)}\n`,
        );
        this._file.replace_contents(
            data,
            null,
            false,
            Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION,
            null,
        );
    }

    stop() {
        try {
            this._file.delete(null);
        } catch (error) {
            if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) throw error;
        }
    }
}
