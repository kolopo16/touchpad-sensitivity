# Touchpad Scroll Sensitivity

A GNOME Shell 50 extension and native backend, built together in this repository.
Adjust touchpad scroll speed from the panel. Uses the native backend built from
this project; requires a one-time user session setup.
The panel slider adjusts finger-scroll sensitivity from 0.10× to 3.00× on both
axes. Preferences persist across sessions, and disabling the extension restores
normal scrolling. Includes its own native backend.

Tested by the author on Fedora 44, GNOME 50.5, Wayland. Other GNOME versions
are not currently supported.

## Installation

On a GNOME desktop, install the build dependencies:

```sh
sudo dnf install gcc make libinput-devel python3
./install.sh
```

The desktop supplies GJS, GTK4, libadwaita, and the `gnome-extensions` CLI.
Node.js and Xvfb are only needed for tests; installation does not run them.

Run `./install.sh` as your desktop user, **without sudo**. Log out and back in,
then enable the extension:

```sh
gnome-extensions enable touchpad-sensitivity@extensions.local
```

## Usage

Open the touchpad icon in the panel and try 0.50×. Its status should say
“Scroll control active”. Preferences are also available with:

```sh
gnome-extensions prefs touchpad-sensitivity@extensions.local
```

The installer targets GNOME's `org.gnome.Shell@.service` systemd user service
(as used by Fedora 44). Other launch arrangements need their own integration.
It refuses to overwrite another configured preload; remove any existing scroll
interposer setup before using this one.

### Installed files

- Extension: `~/.local/share/gnome-shell/extensions/touchpad-sensitivity@extensions.local/`
- Library: `~/.local/share/touchpad-sensitivity/libtouchpad-sensitivity.so`
- Service drop-in: `~/.config/systemd/user/org.gnome.Shell@.service.d/90-touchpad-sensitivity.conf`

The data/config locations respect `XDG_DATA_HOME` and `XDG_CONFIG_HOME`.
The extension ZIP contains the JavaScript UI; **installing that ZIP alone does
not install the native library**. Use `./install.sh` from the complete source.
The native library must be built for the host architecture.

## How it works

GNOME 50 has no public scroll-speed setting. Mutter reads libinput scroll deltas
and delivers them to Wayland clients; a Shell JavaScript slider alone cannot
change those application events. Our C library intercepts
`libinput_event_pointer_get_scroll_value()` and multiplies only
`LIBINPUT_EVENT_POINTER_SCROLL_FINGER` values. Wheel and continuous-source
scrolling pass through. It does not intercept pointer movement or pinch APIs.
Zero-valued gesture-stop events are preserved.

This is a small native interposer, not a Mutter patch. The installer uses a
per-user systemd drop-in to load it into GNOME Shell at login via `LD_PRELOAD`.
It does not configure `/etc/ld.so.preload`. The library is inert outside a
process whose executable basename is `gnome-shell`.

## Lifecycle and troubleshooting

The extension writes a private, atomic control file under `XDG_RUNTIME_DIR`,
named for the Shell PID. It refreshes a 10-second lease every two seconds.
The backend checks at most once per 100 ms while scrolling. Disabling the
extension deletes the file and restores 1× on the next check. A stalled or
crashed extension loses its lease and also returns to 1×. The preferred
multiplier remains saved in GSettings. A Shell stall longer than 10 seconds
can temporarily return scrolling to 1× until the extension resumes.

“Backend not loaded” means the library is absent from the current Shell's
memory maps. Run `./install.sh` and log out/back in. Inspect configuration with:

```sh
systemctl --user cat org.gnome.Shell@user.service
journalctl --user -b -u org.gnome.Shell@user.service
```

Updates to the native library also require logout/login. The installer replaces
it by rename so an existing Shell mapping is not truncated.

## Uninstall / recovery

```sh
make uninstall
```

Then log out and back in to unload the native library. To recover from a login
problem, switch to a text console (Ctrl+Alt+F3), log in, remove the drop-in, and
reload the user service configuration:

```sh
rm -f ~/.config/systemd/user/org.gnome.Shell@.service.d/90-touchpad-sensitivity.conf
systemctl --user daemon-reload
```

Use your custom `XDG_CONFIG_HOME` instead if configured. The next desktop login
will start without our library.

## Development

The extension uses GJS and GNOME libraries, with no runtime npm dependencies.
A small C library provides the native scroll backend.

| File | Purpose |
| --- | --- |
| `extension.js` | Panel slider and extension lifecycle |
| `backend.js` | Backend detection and control-file updates |
| `backend/scroll.c` | Native finger-scroll interception |
| `preferences.js` | Shared preferences UI |
| `prefs.js` | GNOME preferences entry point |
| `schemas/` | GSettings definitions |
| `install.sh` | User installation and temporary schema compilation |
| `tools/backend-install.py` | Native library and systemd drop-in installation |
| `tools/check.sh` | Development check entry point |
| `tests/` | Native, control-file, preferences, and installer tests |

Optional test dependencies on Fedora:

```sh
sudo dnf install nodejs xorg-x11-server-Xvfb
./tools/check.sh
```

Xvfb provides an invisible display for the preferences test. It is not used by
the running extension or native backend.

| Command | Purpose |
| --- | --- |
| `make` | Build the native library |
| `make check` | Run all automated checks |
| `make check-native` | Test native scroll interception |
| `make check-js` | Check JavaScript and the control-file protocol |
| `make check-prefs` | Test preferences using Xvfb |
| `make check-installer` | Test installation in temporary directories |
| `make pack` | Package the extension ZIP |
| `make source` | Package the complete source archive |
| `./install.sh` | Build and install for the current user |
| `make clean` | Remove build artifacts and test caches |

`CC`, `CPPFLAGS`, `CFLAGS`, and `LDFLAGS` may be overridden for native builds.
Build artifacts, ZIPs, and Python caches are excluded from Git. Schemas are
compiled in temporary directories during installation and testing.

Format JavaScript and JSON with the optional development formatter:

```sh
npx --yes prettier@3.6.2 --write '*.js' 'tests/*.js' '*.json'
```

After changing extension JavaScript, reinstall and log out and back in. GNOME
Shell caches loaded modules, so toggling the extension does not reliably reload
code. Preferences settings take effect immediately.

## Validation and scope

`make check` builds with compiler warnings treated as errors and tests actual
ELF symbol interposition against a simulated libinput provider: both axes,
negative and zero deltas, mouse-wheel/continuous pass-through, factor updates,
expired/future leases, malformed/missing configuration, and non-Shell processes.
It also checks JavaScript syntax, compiles the schema, constructs the real
GTK/Adwaita preferences with in-memory settings, verifies the GJS control-file
lifecycle, and tests the installer in isolated temporary directories.

`make pack` and `make source` write their artifacts to `dist/`.
Basic live scrolling has been confirmed on the desktop listed above. For
changes to the backend, also check the following in a fresh login session:

1. Compare 0.50×, 1.00× and 2.00× in GTK and browser applications on both axes.
2. Check wheel scrolling, pointer movement, pinch gestures and kinetic scrolling.
3. Disable/re-enable the extension and confirm normal/saved speed respectively.
4. Check the session log for Shell errors.

Only GNOME 50's modern libinput scroll path is targeted. The backend runs
inside the compositor; keep the recovery instructions above available when
testing native changes.

## References

- [Mutter 50.5 input handling](https://github.com/GNOME/mutter/blob/50.5/src/backends/native/meta-seat-impl.c)
- [libinput pointer events](https://wayland.freedesktop.org/libinput/doc/latest/api/group__event__pointer.html)
