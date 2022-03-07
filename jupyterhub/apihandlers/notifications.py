"""API handlers for notification"""
import json

from tornado import web

from ..scopes import needs_scope
from ..utils import maybe_future
from .base import APIHandler


class NotificationsHandler(APIHandler):
    @needs_scope('admin:users')
    async def put(self):
        """PUT /api/notifications send notification to users

        PUT (JSON) parameters:

        - to: specify users which receive this notification
        - title: specify title of this notification
        - body: specify body of this notification
        """

        data = self.get_json_body()
        if not data:
            raise web.HTTPError(400, "Notification is not specified")
        if 'to' not in data:
            raise web.HTTPError(400, "Users('to') is not specified, %r" % data)
        if 'title' not in data:
            raise web.HTTPError(
                400, "Title of notification('title') is not specified, %r" % data
            )
        if 'body' not in data:
            raise web.HTTPError(
                400, "Body of notification('body') is not specified, %r" % data
            )

        self.log.info("Send Notification {}".format(data))
        to = [self.find_user(u) for u in data['to']]
        for username, user in zip(data['to'], to):
            if user is None:
                self.log.warn('Unknown user %s' % username)
        title = data['title']
        body = data['body']
        await maybe_future(self.app.notifier.notify(self, to, title, body))

        self.set_status(200)
        self.finish(json.dumps({"message": "Sent"}))


class TemplatesHandler(APIHandler):
    @needs_scope('admin:users')
    async def get(self):
        """GET /api/notifications/templates get templates for notifications"""
        templates = [self.normalize(t) for t in self.app.notifier.templates]

        self.set_status(200)
        self.finish(json.dumps({"templates": templates}))

    def normalize(self, t):
        normalized = {"name": t["name"], "default": False, "subject": None, "body": ""}
        for k, v in t.items():
            if k == "default":
                normalized[k] = bool(v)
            elif k == "subject" or k == "body" or k == "name":
                normalized[k] = str(v) if v is not None else None
            else:
                raise KeyError(k)
        return normalized


default_handlers = [
    (r"/api/notifications", NotificationsHandler),
    (r"/api/notifications/templates", TemplatesHandler),
]
