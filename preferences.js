import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

export function buildPreferences(window, settings) {
    const page = new Adw.PreferencesPage({title: 'Touchpad', icon_name: 'input-touchpad-symbolic'});
    window.add(page);
    const group = new Adw.PreferencesGroup({
        title: 'Scroll sensitivity',
        description:
            'Both scroll directions. 0.50× is half speed; 1.00× is normal. Enable the extension to apply changes.',
    });
    page.add(group);
    const row = new Adw.SpinRow({
        title: 'Scroll multiplier',
        digits: 2,
        adjustment: new Gtk.Adjustment({
            lower: 0.1,
            upper: 3,
            step_increment: 0.05,
            page_increment: 0.25,
        }),
    });
    settings.bind('scroll-factor', row, 'value', Gio.SettingsBindFlags.DEFAULT);
    group.add(row);
    const reset = new Adw.ActionRow({title: 'Restore normal speed'});
    const button = new Gtk.Button({label: 'Reset', valign: Gtk.Align.CENTER});
    button.connect('clicked', () => settings.reset('scroll-factor'));
    reset.add_suffix(button);
    reset.activatable_widget = button;
    group.add(reset);
    const setup = new Adw.PreferencesGroup({
        title: 'Native backend setup',
        description:
            'Build and install this project with “./install.sh”, then log out and back in. The native library must be loaded when GNOME Shell starts. No separate scroll-control project is required.',
    });
    page.add(setup);
    setup.add(
        new Adw.ActionRow({
            title: 'Disable the extension to restore normal scrolling',
            subtitle:
                'Your preferred sensitivity is saved for the next time you enable it. If the extension stops responding, the backend returns to normal speed after 10 seconds.',
            subtitle_lines: 0,
        }),
    );
}
