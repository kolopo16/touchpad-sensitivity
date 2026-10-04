import GLib from 'gi://GLib';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {Backend} from './backend.js';

const APPLY_DELAY_MS = 200;
const HEARTBEAT_SECONDS = 2;

export default class TouchpadSensitivity extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._backend = new Backend();
        this._timer = 0;
        this._lastError = null;
        this._button = new PanelMenu.Button(0.0, this.metadata.name);
        this._button.add_child(
            new St.Icon({
                icon_name: 'input-touchpad-symbolic',
                style_class: 'system-status-icon',
            }),
        );
        this._label = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._button.menu.addMenuItem(this._label);
        const row = new PopupMenu.PopupBaseMenuItem({activate: false});
        this._slider = new Slider(0);
        this._slider.accessible_name = 'Touchpad scroll sensitivity';
        this._slider.x_expand = true;
        row.add_child(this._slider);
        this._button.menu.addMenuItem(row);
        this._status = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._button.menu.addMenuItem(this._status);
        this._button.menu.addAction('Reset to 1.00×', () =>
            this._settings.set_double('scroll-factor', 1),
        );
        this._button.menu.addAction('Preferences', () => this.openPreferences());
        this._slider.connect('notify::value', () => {
            if (!this._syncing)
                this._settings.set_double(
                    'scroll-factor',
                    Math.round((0.1 + this._slider.value * 2.9) * 100) / 100,
                );
        });
        this._changed = this._settings.connect('changed::scroll-factor', () => {
            this._sync();
            this._queueApply();
        });
        Main.panel.addToStatusArea(this.uuid, this._button);
        this._sync();
        this._apply();
        this._heartbeat = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, HEARTBEAT_SECONDS, () => {
            this._apply();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _sync() {
        const factor = this._settings.get_double('scroll-factor');
        this._syncing = true;
        this._slider.value = (factor - 0.1) / 2.9;
        this._syncing = false;
        this._label.label.text = `Scroll sensitivity: ${factor.toFixed(2)}×`;
    }

    _queueApply() {
        if (this._timer) GLib.Source.remove(this._timer);
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, APPLY_DELAY_MS, () => {
            this._timer = 0;
            this._apply();
            return GLib.SOURCE_REMOVE;
        });
    }

    _apply() {
        try {
            if (!this._backend.isLoaded()) {
                this._status.label.text = 'Backend not loaded — see Preferences';
                return;
            }
            this._backend.apply(this._settings.get_double('scroll-factor'));
            this._lastError = null;
            this._status.label.text = 'Scroll control active';
        } catch (error) {
            this._status.label.text = 'Backend error — see session log';
            if (this._lastError !== error.message) console.error(`[${this.uuid}] ${error.message}`);
            this._lastError = error.message;
        }
    }

    disable() {
        if (this._timer) GLib.Source.remove(this._timer);
        if (this._heartbeat) GLib.Source.remove(this._heartbeat);
        this._timer = this._heartbeat = 0;
        try {
            this._backend?.stop();
        } catch (error) {
            console.error(`[${this.uuid}] ${error.message}`);
        }
        this._backend = null;
        this._settings?.disconnect(this._changed);
        this._button?.destroy();
        this._button = this._slider = this._label = this._status = null;
        this._settings = null;
    }
}
