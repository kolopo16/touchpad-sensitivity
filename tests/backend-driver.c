#define _POSIX_C_SOURCE 200809L
#include <libinput.h>
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <unistd.h>

struct libinput_event_pointer {
    enum libinput_event_type type;
    double value;
};
static char path[4096];

static void config(const char *percent, long long age)
{
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    FILE *file = fopen(path, "w");
    assert(file);
    fprintf(file, "v1 %lld %s\n",
            (long long)now.tv_sec * 1000000 + now.tv_nsec / 1000 - age, percent);
    fclose(file);
    struct timespec wait = {.tv_nsec = 120000000};
    nanosleep(&wait, NULL);
}

static void check(enum libinput_event_type type, double input, double expected)
{
    struct libinput_event_pointer event = {.type = type, .value = input};
    assert(fabs(libinput_event_pointer_get_scroll_value(&event,
                LIBINPUT_POINTER_AXIS_SCROLL_VERTICAL) - expected) < 0.000001);
    assert(fabs(libinput_event_pointer_get_scroll_value(&event,
                LIBINPUT_POINTER_AXIS_SCROLL_HORIZONTAL) - expected) < 0.000001);
}

int main(int argc, char **argv)
{
    (void)argv;
    snprintf(path, sizeof path, "%s/touchpad-sensitivity-%ld.control",
             getenv("XDG_RUNTIME_DIR"), (long)getpid());
    config("50", 0);
    if (argc > 1) {
        check(LIBINPUT_EVENT_POINTER_SCROLL_FINGER, 8, 8);
        unlink(path);
        puts("Non-Shell process left unchanged.");
        return 0;
    }
    check(LIBINPUT_EVENT_POINTER_SCROLL_FINGER, 8, 4);
    check(LIBINPUT_EVENT_POINTER_SCROLL_FINGER, -8, -4);
    check(LIBINPUT_EVENT_POINTER_SCROLL_FINGER, 0, 0);
    check(LIBINPUT_EVENT_POINTER_SCROLL_WHEEL, 8, 8);
    check(LIBINPUT_EVENT_POINTER_SCROLL_CONTINUOUS, 8, 8);
    config("200", 0);
    check(LIBINPUT_EVENT_POINTER_SCROLL_FINGER, 8, 16);
    config("50", 11000000);
    check(LIBINPUT_EVENT_POINTER_SCROLL_FINGER, 8, 8);
    config("50", -10000000);
    check(LIBINPUT_EVENT_POINTER_SCROLL_FINGER, 8, 8);
    const char *invalid[] = {"0", "301", "-50", "nan", "50 garbage", ""};
    for (unsigned int i = 0; i < sizeof invalid / sizeof invalid[0]; i++) {
        config(invalid[i], 0);
        check(LIBINPUT_EVENT_POINTER_SCROLL_FINGER, 8, 8);
    }
    config("50", 0);
    check(LIBINPUT_EVENT_POINTER_SCROLL_FINGER, 8, 4);
    unlink(path);
    struct timespec wait = {.tv_nsec = 120000000};
    nanosleep(&wait, NULL);
    check(LIBINPUT_EVENT_POINTER_SCROLL_FINGER, 8, 8);
    puts("Native interposition: both axes, sign, stop, wheel, continuous, live updates, lease expiry and invalid/missing configuration passed.");
    return 0;
}
