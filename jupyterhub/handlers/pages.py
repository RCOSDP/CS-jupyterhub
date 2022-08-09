"""Basic html-rendering handlers."""
# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.
import asyncio
import os
import time
from collections import defaultdict
from datetime import datetime
from http.client import responses

import requests
from jinja2 import TemplateNotFound
from tornado import web
from tornado.httputil import url_concat

from .. import __version__
from ..metrics import SERVER_POLL_DURATION_SECONDS
from ..metrics import ServerPollStatus
from ..scopes import needs_scope
from ..utils import maybe_future
from ..utils import url_path_join
from .base import BaseHandler


class RootHandler(BaseHandler):
    """Render the Hub root page.

    If next argument is passed by single-user server,
    redirect to base_url + single-user page.

    If logged in, redirects to:

    - single-user server if settings.redirect_to_server (default)
    - hub home, otherwise

    Otherwise, renders login page.
    """

    def get(self):
        user = self.current_user
        if self.default_url:
            # As set in jupyterhub_config.py
            if callable(self.default_url):
                url = self.default_url(self)
            else:
                url = self.default_url
        elif user:
            url = self.get_next_url(user)
        else:
            url = url_concat(self.settings["login_url"], dict(next=self.request.uri))
            return_on_error = self.get_argument('return_on_error', None)
            if return_on_error:
                url = url_concat(url, dict(return_on_error=return_on_error))
        self.redirect(url)


class HomeHandler(BaseHandler):
    """Render the user's home page."""

    @web.authenticated
    async def get(self):
        user = self.current_user
        if user.running:
            # trigger poll_and_notify event in case of a server that died
            await user.spawner.poll_and_notify()

        # send the user to /spawn if they have no active servers,
        # to establish that this is an explicit spawn request rather
        # than an implicit one, which can be caused by any link to `/user/:name(/:server_name)`
        if user.active:
            url = url_path_join(self.base_url, 'user', user.escaped_name)
        else:
            url = url_path_join(self.hub.base_url, 'spawn', user.escaped_name)

        auth_state = await user.get_auth_state()
        html = await self.render_template(
            'home.html',
            auth_state=auth_state,
            user=user,
            url=url,
            allow_named_servers=self.allow_named_servers,
            named_server_limit_per_user=self.named_server_limit_per_user,
            url_path_join=url_path_join,
            # can't use user.spawners because the stop method of User pops named servers from user.spawners when they're stopped
            spawners=user.orm_user._orm_spawners,
            default_server=user.spawner,
        )
        self.finish(html)


class SpawnHandler(BaseHandler):
    """Handle spawning of single-user servers

    GET renders the form, POST handles form submission.

    If no `options_form` is enabled, GET triggers spawn directly.
    """

    default_url = None

    async def _render_form(self, for_user, spawner_options_form, message=''):
        auth_state = await for_user.get_auth_state()
        return await self.render_template(
            'spawn.html',
            for_user=for_user,
            auth_state=auth_state,
            spawner_options_form=spawner_options_form,
            error_message=message,
            url=self.request.uri,
            spawner=for_user.spawner,
        )

    @web.authenticated
    def get(self, user_name=None, server_name=''):
        """GET renders form for spawning with user-specified options

        or triggers spawn via redirect if there is no form.
        """
        # two-stage to get the right signature for @require_scopes filter on user_name
        if user_name is None:
            user_name = self.current_user.name
        if server_name is None:
            server_name = ""
        return self._get(user_name=user_name, server_name=server_name)

    @needs_scope("servers")
    async def _get(self, user_name, server_name):
        for_user = user_name

        user = current_user = self.current_user
        if for_user != user.name:
            user = self.find_user(for_user)
            if user is None:
                raise web.HTTPError(404, f"No such user: {for_user}")

        if server_name:
            if not self.allow_named_servers:
                raise web.HTTPError(400, "Named servers are not enabled.")
            if (
                self.named_server_limit_per_user > 0
                and server_name not in user.orm_spawners
            ):
                named_spawners = list(user.all_spawners(include_default=False))
                if self.named_server_limit_per_user <= len(named_spawners):
                    raise web.HTTPError(
                        400,
                        "User {} already has the maximum of {} named servers."
                        "  One must be deleted before a new server can be created".format(
                            user.name, self.named_server_limit_per_user
                        ),
                    )

        if not self.allow_named_servers and user.running:
            url = self.get_next_url(user, default=user.server_url(""))
            self.log.info("User is running: %s", user.name)
            self.redirect(url)
            return

        spawner = user.get_spawner(server_name, replace_failed=True)

        pending_url = self._get_pending_url(user, server_name)

        # spawner is active, redirect back to get progress, etc.
        if spawner.ready:
            self.log.info("Server %s is already running", spawner._log_name)
            next_url = self.get_next_url(user, default=user.server_url(server_name))
            self.redirect(next_url)
            return

        elif spawner.active:
            self.log.info("Server %s is already active", spawner._log_name)
            self.redirect(pending_url)
            return

        # Add handler to spawner here so you can access query params in form rendering.
        spawner.handler = self

        # auth_state may be an input to options form,
        # so resolve the auth state hook here
        auth_state = await user.get_auth_state()
        await spawner.run_auth_state_hook(auth_state)

        # Try to start server directly when query arguments are passed.
        error_message = ''
        query_options = {}
        for key, byte_list in self.request.query_arguments.items():
            query_options[key] = [bs.decode('utf8') for bs in byte_list]

        # 'next' is reserved argument for redirect after spawn
        query_options.pop('next', None)

        if len(query_options) > 0:
            try:
                self.log.debug(
                    "Triggering spawn with supplied query arguments for %s",
                    spawner._log_name,
                )
                options = await maybe_future(spawner.options_from_query(query_options))
                return await self._wrap_spawn_single_user(
                    user, server_name, spawner, pending_url, options
                )
            except Exception as e:
                self.log.error(
                    "Failed to spawn single-user server with query arguments",
                    exc_info=True,
                )
                error_message = str(e)
                # fallback to behavior without failing query arguments

        spawner_options_form = await spawner.get_options_form()
        if spawner_options_form:
            self.log.debug("Serving options form for %s", spawner._log_name)
            form = await self._render_form(
                for_user=user,
                spawner_options_form=spawner_options_form,
                message=error_message,
            )
            self.finish(form)
        else:
            self.log.debug(
                "Triggering spawn with default options for %s", spawner._log_name
            )
            return await self._wrap_spawn_single_user(
                user, server_name, spawner, pending_url
            )

    @web.authenticated
    def post(self, user_name=None, server_name=''):
        """POST spawns with user-specified options"""
        if user_name is None:
            user_name = self.current_user.name
        if server_name is None:
            server_name = ""
        return self._post(user_name=user_name, server_name=server_name)

    @needs_scope("servers")
    async def _post(self, user_name, server_name):
        for_user = user_name
        user = current_user = self.current_user
        if for_user != user.name:
            user = self.find_user(for_user)
            if user is None:
                raise web.HTTPError(404, "No such user: %s" % for_user)

        spawner = user.get_spawner(server_name, replace_failed=True)

        if spawner.ready:
            raise web.HTTPError(400, "%s is already running" % (spawner._log_name))
        elif spawner.pending:
            raise web.HTTPError(
                400, f"{spawner._log_name} is pending {spawner.pending}"
            )

        form_options = {}
        for key, byte_list in self.request.body_arguments.items():
            form_options[key] = [bs.decode('utf8') for bs in byte_list]
        for key, byte_list in self.request.files.items():
            form_options["%s_file" % key] = byte_list
        try:
            self.log.debug(
                "Triggering spawn with supplied form options for %s", spawner._log_name
            )
            options = await maybe_future(spawner.run_options_from_form(form_options))
            pending_url = self._get_pending_url(user, server_name)
            return await self._wrap_spawn_single_user(
                user, server_name, spawner, pending_url, options
            )
        except Exception as e:
            self.log.error(
                "Failed to spawn single-user server with form", exc_info=True
            )
            spawner_options_form = await user.spawner.get_options_form()
            form = await self._render_form(
                for_user=user, spawner_options_form=spawner_options_form, message=str(e)
            )
            self.finish(form)
            return
        if current_user is user:
            self.set_login_cookie(user)
        next_url = self.get_next_url(
            user,
            default=url_path_join(
                self.hub.base_url, "spawn-pending", user.escaped_name, server_name
            ),
        )
        self.redirect(next_url)

    def _get_pending_url(self, user, server_name):
        # resolve `?next=...`, falling back on the spawn-pending url
        # must not be /user/server for named servers,
        # which may get handled by the default server if they aren't ready yet

        pending_url = url_path_join(
            self.hub.base_url, "spawn-pending", user.escaped_name, server_name
        )

        pending_url = self.append_query_parameters(pending_url, exclude=['next'])

        if self.get_argument('next', None):
            # preserve `?next=...` through spawn-pending
            pending_url = url_concat(pending_url, {'next': self.get_argument('next')})

        return pending_url

    async def _wrap_spawn_single_user(
        self, user, server_name, spawner, pending_url, options=None
    ):
        # Explicit spawn request: clear _spawn_future
        # which may have been saved to prevent implicit spawns
        # after a failure.
        if spawner._spawn_future and spawner._spawn_future.done():
            spawner._spawn_future = None
        # not running, no form. Trigger spawn and redirect back to /user/:name
        f = asyncio.ensure_future(
            self.spawn_single_user(user, server_name, options=options)
        )
        done, pending = await asyncio.wait([f], timeout=1)
        # If spawn_single_user throws an exception, raise a 500 error
        # otherwise it may cause a redirect loop
        if f.done() and f.exception():
            exc = f.exception()
            self.log.exception(f"Error starting server {spawner._log_name}: {exc}")
            if isinstance(exc, web.HTTPError):
                # allow custom HTTPErrors to pass through
                raise exc
            raise web.HTTPError(
                500,
                f"Unhandled error starting server {spawner._log_name}",
            )
        return self.redirect(pending_url)


class SpawnPendingHandler(BaseHandler):
    """Handle /hub/spawn-pending/:user/:server

    One and only purpose:

    - wait for pending spawn
    - serve progress bar
    - redirect to /user/:name when ready
    - show error if spawn failed

    Functionality split out of /user/:name handler to
    have clearer behavior at the right time.

    Requests for this URL will never trigger any actions
    such as spawning new servers.
    """

    @web.authenticated
    @needs_scope("servers")
    async def get(self, user_name, server_name=''):
        for_user = user_name
        user = current_user = self.current_user
        if for_user != current_user.name:
            user = self.find_user(for_user)
            if user is None:
                raise web.HTTPError(404, "No such user: %s" % for_user)

        if server_name and server_name not in user.spawners:
            raise web.HTTPError(404, f"{user.name} has no such server {server_name}")

        spawner = user.spawners[server_name]

        if spawner.ready:
            # spawner is ready and waiting. Redirect to it.
            next_url = self.get_next_url(default=user.server_url(server_name))
            self.redirect(next_url)
            return

        # if spawning fails for any reason, point users to /hub/home to retry
        self.extra_error_html = self.spawn_home_error

        auth_state = await user.get_auth_state()

        # First, check for previous failure.
        if not spawner.active and spawner._failed:
            # Condition: spawner not active and last spawn failed
            # (failure is available as spawner._spawn_future.exception()).
            # Implicit spawn on /user/:name is not allowed if the user's last spawn failed.
            # We should point the user to Home if the most recent spawn failed.
            exc = spawner._spawn_future.exception()
            self.log.error("Previous spawn for %s failed: %s", spawner._log_name, exc)
            spawn_url = url_path_join(
                self.hub.base_url, "spawn", user.escaped_name, server_name
            )
            self.set_status(500)
            html = await self.render_template(
                "not_running.html",
                user=user,
                auth_state=auth_state,
                server_name=server_name,
                spawn_url=spawn_url,
                failed=True,
                failed_html_message=getattr(exc, 'jupyterhub_html_message', ''),
                failed_message=getattr(exc, 'jupyterhub_message', ''),
                exception=exc,
            )
            self.finish(html)
            return

        # Check for pending events. This should usually be the case
        # when we are on this page.
        # page could be pending spawn *or* stop
        if spawner.pending:
            self.log.info("%s is pending %s", spawner._log_name, spawner.pending)
            # spawn has started, but not finished
            url_parts = []
            if spawner.pending == "stop":
                page = "stop_pending.html"
            else:
                page = "spawn_pending.html"
            html = await self.render_template(
                page,
                user=user,
                spawner=spawner,
                progress_url=spawner._progress_url,
                auth_state=auth_state,
            )
            self.finish(html)
            return

        # spawn is supposedly ready, check on the status
        if spawner.ready:
            poll_start_time = time.perf_counter()
            status = await spawner.poll()
            SERVER_POLL_DURATION_SECONDS.labels(
                status=ServerPollStatus.from_status(status)
            ).observe(time.perf_counter() - poll_start_time)
        else:
            status = 0

        # server is not running, render "not running" page
        # further, set status to 404 because this is not
        # serving the expected page
        if status is not None:
            spawn_url = url_path_join(
                self.hub.base_url, "spawn", user.escaped_name, server_name
            )
            html = await self.render_template(
                "not_running.html",
                user=user,
                auth_state=auth_state,
                server_name=server_name,
                spawn_url=spawn_url,
            )
            self.finish(html)
            return

        # we got here, server appears to be ready and running,
        # no longer pending.
        # redirect to the running server.

        next_url = self.get_next_url(default=user.server_url(server_name))
        self.redirect(next_url)


class GrafanaImageHandler(BaseHandler):
    @web.authenticated
    @needs_scope('admin:servers')
    async def get(self):
        grafana_host = os.environ.get('GRAFANA_INTERNAL_HOST')
        from_time = (int(time.time()) - 1800) * 1000
        res = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: requests.get(
                f"http://{grafana_host}/render/d-solo/icjpCppik/k8-cluster-detail-dashboard?orgId=1&refresh=1m&var-Node=All&panelId={self.panel_id()}&width=300&height=300&tz=Asia%2FTokyo&from={from_time}",
                headers={
                    "Authorization": 'Bearer ' + os.environ.get('GRAFANA_API_KEY')
                },
            ),
        )
        self.write(res.content)
        self.set_header("Content-type", "image/png")


class GrafanaCpuPanelHandler(GrafanaImageHandler):
    def panel_id(self):
        return '2052'


class GrafanaMemoryPanelHandler(GrafanaImageHandler):
    def panel_id(self):
        return '2051'


class AdminHandler(BaseHandler):
    """Render the admin page."""

    @web.authenticated
    # stacked decorators: all scopes must be present
    # note: keep in sync with admin link condition in page.html
    @needs_scope('admin:users')
    @needs_scope('admin:servers')
    async def get(self):
        auth_state = await self.current_user.get_auth_state()
        limit = self.get_argument('limit', None)
        html = await self.render_template(
            'admin.html',
            current_user=self.current_user,
            auth_state=auth_state,
            admin_access=self.settings.get('admin_access', False),
            allow_named_servers=self.allow_named_servers,
            named_server_limit_per_user=self.named_server_limit_per_user,
            server_version=f'{__version__} {self.version_hash}',
            api_page_limit=limit if limit else self.settings["api_page_default_limit"],
            base_url=self.settings["base_url"],
            grafana_host=os.environ.get('GRAFANA_EXTERNAL_HOST'),
        )
        self.finish(html)


class TokenPageHandler(BaseHandler):
    """Handler for page requesting new API tokens"""

    @web.authenticated
    async def get(self):
        never = datetime(1900, 1, 1)

        user = self.current_user

        def sort_key(token):
            return (token.last_activity or never, token.created or never)

        now = datetime.utcnow()

        # group oauth client tokens by client id
        all_tokens = defaultdict(list)
        for token in sorted(user.api_tokens, key=sort_key, reverse=True):
            if token.expires_at and token.expires_at < now:
                self.log.warning(f"Deleting expired token {token}")
                self.db.delete(token)
                self.db.commit()
                continue
            if not token.client_id:
                # token should have been deleted when client was deleted
                self.log.warning(f"Deleting stale oauth token {token}")
                self.db.delete(token)
                self.db.commit()
                continue
            all_tokens[token.client_id].append(token)

        # individually list tokens issued by jupyterhub itself
        api_tokens = all_tokens.pop("jupyterhub", [])

        # group all other tokens issued under their owners
        # get the earliest created and latest last_activity
        # timestamp for a given oauth client
        oauth_clients = []

        for client_id, tokens in all_tokens.items():
            created = tokens[0].created
            last_activity = tokens[0].last_activity
            for token in tokens[1:]:
                if token.created < created:
                    created = token.created
                if last_activity is None or (
                    token.last_activity and token.last_activity > last_activity
                ):
                    last_activity = token.last_activity
            token = tokens[0]
            oauth_clients.append(
                {
                    'client': token.oauth_client,
                    'description': token.oauth_client.description
                    or token.oauth_client.identifier,
                    'created': created,
                    'last_activity': last_activity,
                    'tokens': tokens,
                    # only need one token id because
                    # revoking one oauth token revokes all oauth tokens for that client
                    'token_id': tokens[0].api_id,
                    'token_count': len(tokens),
                }
            )

        # sort oauth clients by last activity, created
        def sort_key(client):
            return (client['last_activity'] or never, client['created'] or never)

        oauth_clients = sorted(oauth_clients, key=sort_key, reverse=True)

        auth_state = await self.current_user.get_auth_state()
        html = await self.render_template(
            'token.html',
            api_tokens=api_tokens,
            oauth_clients=oauth_clients,
            auth_state=auth_state,
        )
        self.finish(html)


class ProxyErrorHandler(BaseHandler):
    """Handler for rendering proxy error pages"""

    async def get(self, status_code_s):
        status_code = int(status_code_s)
        status_message = responses.get(status_code, 'Unknown HTTP Error')
        # build template namespace

        hub_home = url_path_join(self.hub.base_url, 'home')
        message_html = ''
        if status_code == 503:
            message_html = ' '.join(
                [
                    "Your server appears to be down.",
                    "Try restarting it <a href='%s'>from the hub</a>" % hub_home,
                ]
            )
        ns = dict(
            status_code=status_code,
            status_message=status_message,
            message_html=message_html,
            logo_url=hub_home,
        )

        self.set_header('Content-Type', 'text/html')
        # render the template
        try:
            html = await self.render_template('%s.html' % status_code, **ns)
        except TemplateNotFound:
            self.log.debug("No template for %d", status_code)
            html = await self.render_template('error.html', **ns)

        self.write(html)


class HealthCheckHandler(BaseHandler):
    """Serve health check probes as quickly as possible"""

    # There is nothing for us to do other than return a positive
    # HTTP status code as quickly as possible for GET or HEAD requests
    def get(self):
        pass

    head = get


default_handlers = [
    (r'/', RootHandler),
    (r'/home', HomeHandler),
    (r'/admin', AdminHandler),
    (r'/spawn-pending/([^/]+)', SpawnPendingHandler),
    (r'/spawn-pending/([^/]+)/([^/]+)', SpawnPendingHandler),
    (r'/spawn', SpawnHandler),
    (r'/spawn/([^/]+)', SpawnHandler),
    (r'/spawn/([^/]+)/([^/]+)', SpawnHandler),
    (r'/token', TokenPageHandler),
    (r'/error/(\d+)', ProxyErrorHandler),
    (r'/health$', HealthCheckHandler),
    (r'/api/health$', HealthCheckHandler),
    (r'/grafana_memory_panel', GrafanaCpuPanelHandler),
    (r'/grafana_cpu_panel', GrafanaMemoryPanelHandler),
]
