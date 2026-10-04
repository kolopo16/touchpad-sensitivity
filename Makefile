.DEFAULT_GOAL := all
UUID = touchpad-sensitivity@local
CC ?= cc
CFLAGS ?= -O2 -g
WARNINGS = -Wall -Wextra -Werror
EXTENSION_SOURCES = metadata.json extension.js prefs.js preferences.js backend.js README.md
SCHEMA = schemas/org.gnome.shell.extensions.touchpad-sensitivity.gschema.xml
ARCHIVE = dist/$(UUID).shell-extension.zip

.PHONY: all check check-native check-js check-prefs check-installer pack source install uninstall clean
all: build/libtouchpad-sensitivity.so

build/libtouchpad-sensitivity.so: backend/scroll.c
	mkdir -p build
	$(CC) $(CPPFLAGS) $(CFLAGS) $(WARNINGS) -std=c11 -fPIC -shared $(LDFLAGS) -o $@ $< -ldl -pthread

build/tests/libfakeinput.so: tests/fake-libinput.c
	mkdir -p build/tests
	$(CC) $(CPPFLAGS) $(CFLAGS) $(WARNINGS) -std=c11 -fPIC -shared -o $@ $<

build/tests/gnome-shell: tests/backend-driver.c build/tests/libfakeinput.so
	$(CC) $(CPPFLAGS) $(CFLAGS) $(WARNINGS) -std=c11 -o $@ $< -Lbuild/tests -lfakeinput -Wl,-rpath,'$$ORIGIN' -lm

build/tests/other-process: build/tests/gnome-shell
	cp $< $@

check: check-native check-js check-prefs check-installer

check-native: all build/tests/gnome-shell build/tests/other-process
	sh tests/backend.sh

check-js:
	node --input-type=module --check < extension.js
	node --input-type=module --check < backend.js
	node --input-type=module --check < prefs.js
	node --input-type=module --check < preferences.js
	sh tests/gjs-backend.sh

check-prefs:
	@staging=$$(mktemp -d); \
	trap 'rm -rf "$$staging"' EXIT; \
	cp $(SCHEMA) "$$staging/" && \
	glib-compile-schemas --strict "$$staging" && \
	GSETTINGS_SCHEMA_DIR="$$staging" GSETTINGS_BACKEND=memory xvfb-run -a gjs -m tests/preferences.js

check-installer: all
	PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'

pack: $(ARCHIVE)

$(ARCHIVE): $(EXTENSION_SOURCES) $(SCHEMA)
	mkdir -p dist
	gnome-extensions pack --force --extra-source=preferences.js --extra-source=backend.js --extra-source=README.md --out-dir=dist .

source:
	mkdir -p dist
	tar --exclude=__pycache__ -czf dist/touchpad-sensitivity-native-source.tar.gz backend tools tests install.sh Makefile metadata.json extension.js prefs.js preferences.js backend.js schemas/*.xml README.md .gitignore .editorconfig .prettierrc.json

install:
	./install.sh

uninstall:
	-gnome-extensions disable $(UUID)
	python3 tools/backend-install.py uninstall
	-gnome-extensions uninstall $(UUID)

clean:
	rm -f schemas/gschemas.compiled
	rm -rf build dist
	rm -rf tools/__pycache__ tests/__pycache__
