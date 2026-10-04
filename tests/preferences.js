import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import {buildPreferences} from '../preferences.js';

Adw.init();
const settings = new Gio.Settings({schema_id: 'org.gnome.shell.extensions.touchpad-sensitivity'});
const window = new Adw.PreferencesWindow();
buildPreferences(window, settings);
window.present();
settings.set_double('scroll-factor', 0.5);
if (settings.get_double('scroll-factor') !== 0.5)
    throw new Error('Could not save the scroll multiplier');
settings.reset('scroll-factor');
if (settings.get_double('scroll-factor') !== 1)
    throw new Error('Reset did not restore normal speed');
window.destroy();
print('Preferences window constructed; settings and reset passed.');
