from . import auth, groups, hub, proxy, services, shares, users, notifications
from .base import *  # noqa

default_handlers = []
for mod in (auth, hub, proxy, users, groups, services, shares, notifications):
    default_handlers.extend(mod.default_handlers)
