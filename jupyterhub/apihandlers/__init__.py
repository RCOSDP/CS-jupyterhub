from . import auth, groups, hub, notifications, proxy, services, users
from .base import *  # noqa

default_handlers = []
for mod in (auth, hub, proxy, users, groups, services, notifications):
    default_handlers.extend(mod.default_handlers)
