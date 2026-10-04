#include <libinput.h>

/* The test driver and fixture share this private layout, not libinput internals. */
struct libinput_event_pointer {
    enum libinput_event_type type;
    double value;
};

double libinput_event_pointer_get_scroll_value(struct libinput_event_pointer *event,
                                              enum libinput_pointer_axis axis)
{
    (void)axis;
    return event->value;
}

struct libinput_event *libinput_event_pointer_get_base_event(struct libinput_event_pointer *event)
{
    return (struct libinput_event *)event;
}

enum libinput_event_type libinput_event_get_type(struct libinput_event *event)
{
    return ((struct libinput_event_pointer *)event)->type;
}
