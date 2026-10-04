/* Scale GNOME 50 finger-scroll deltas while preserving other input events. */
#define _GNU_SOURCE
#include <libinput.h>
#include <dlfcn.h>
#include <fcntl.h>
#include <limits.h>
#include <math.h>
#include <pthread.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

static pthread_once_t once = PTHREAD_ONCE_INIT;
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static double (*real_value)(struct libinput_event_pointer *, enum libinput_pointer_axis);
static struct libinput_event *(*base_event)(struct libinput_event_pointer *);
static enum libinput_event_type (*event_type)(struct libinput_event *);
static char control_path[PATH_MAX];
static bool enabled;
static long long next_check;
static double cached_factor = 1.0;

#define CONFIG_POLL_US 100000
#define CONTROL_LEASE_US 10000000

static long long monotonic_us(void)
{
    struct timespec now;
    if (clock_gettime(CLOCK_MONOTONIC, &now) != 0)
        return 0;
    return (long long)now.tv_sec * 1000000 + now.tv_nsec / 1000;
}

static void initialize(void)
{
    *(void **)(&real_value) = dlsym(RTLD_NEXT, "libinput_event_pointer_get_scroll_value");
    *(void **)(&base_event) = dlsym(RTLD_NEXT, "libinput_event_pointer_get_base_event");
    *(void **)(&event_type) = dlsym(RTLD_NEXT, "libinput_event_get_type");
    char executable[PATH_MAX];
    ssize_t n = readlink("/proc/self/exe", executable, sizeof executable - 1);
    if (n < 0)
        return;
    executable[n] = '\0';
    const char *name = strrchr(executable, '/');
    if (!name || strcmp(name + 1, "gnome-shell") != 0)
        return;
    const char *runtime = getenv("XDG_RUNTIME_DIR");
    struct stat st;
    if (!runtime || runtime[0] != '/' || stat(runtime, &st) != 0 ||
        !S_ISDIR(st.st_mode) || st.st_uid != getuid() || (st.st_mode & 0077))
        return;
    int size = snprintf(control_path, sizeof control_path,
                        "%s/touchpad-sensitivity-%ld.control", runtime, (long)getpid());
    enabled = size > 0 && (size_t)size < sizeof control_path &&
              real_value && base_event && event_type;
}

/* The extension refreshes a short lease. A crash, disable, or missing/invalid
 * file falls back to 1x. Reads are bounded and cached for 100 ms. */
static double factor(void)
{
    pthread_mutex_lock(&lock);
    long long now = monotonic_us();
    if (now >= next_check) {
        next_check = now + CONFIG_POLL_US;
        cached_factor = 1.0;
        int fd = open(control_path, O_RDONLY | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK);
        if (fd >= 0) {
            struct stat st;
            char text[128];
            ssize_t n = -1;
            if (fstat(fd, &st) == 0 && S_ISREG(st.st_mode) && st.st_uid == getuid() &&
                st.st_size > 0 && st.st_size < (off_t)sizeof text)
                n = read(fd, text, sizeof text - 1);
            close(fd);
            if (n > 0) {
                text[n] = '\0';
                long long timestamp;
                unsigned int percent;
                char trailing;
                /* Integers keep parsing independent of the desktop locale. */
                if (sscanf(text, "v1 %lld %u %c", &timestamp, &percent, &trailing) == 2 &&
                    timestamp > 0 && timestamp <= now && now - timestamp <= CONTROL_LEASE_US &&
                    percent >= 10 && percent <= 300)
                    cached_factor = percent / 100.0;
            }
        }
    }
    double result = cached_factor;
    pthread_mutex_unlock(&lock);
    return result;
}

double libinput_event_pointer_get_scroll_value(struct libinput_event_pointer *event,
                                              enum libinput_pointer_axis axis)
{
    pthread_once(&once, initialize);
    if (!real_value)
        return 0.0;
    double value = real_value(event, axis);
    if (!enabled || !isfinite(value) || value == 0.0 ||
        event_type(base_event(event)) != LIBINPUT_EVENT_POINTER_SCROLL_FINGER)
        return value;
    return value * factor();
}
