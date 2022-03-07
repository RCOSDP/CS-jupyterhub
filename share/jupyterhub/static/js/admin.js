// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

require(["jquery", "moment", "jhapi", "utils"], function (
  $,
  moment,
  JHAPI,
  utils
) {
  "use strict";

  var base_url = window.jhdata.base_url;
  var prefix = window.jhdata.prefix;
  var admin_access = window.jhdata.admin_access;
  var options_form = window.jhdata.options_form;

  var api = new JHAPI(base_url);

  var notification_templates = Object();

  function getRow(element) {
    var original = element;
    while (!element.hasClass("server-row")) {
      element = element.parent();
      if (element[0].tagName === "BODY") {
        console.error("Couldn't find row for", original);
        throw new Error("No server-row found");
      }
    }
    return element;
  }

  function resort(col, order) {
    var query = window.location.search.slice(1).split("&");
    // if col already present in args, remove it
    var i = 0;
    while (i < query.length) {
      if (query[i] === "sort=" + col) {
        query.splice(i, 1);
        if (query[i] && query[i].substr(0, 6) === "order=") {
          query.splice(i, 1);
        }
      } else {
        i += 1;
      }
    }
    // add new order to the front
    if (order) {
      query.unshift("order=" + order);
    }
    query.unshift("sort=" + col);
    // reload page with new order
    window.location = window.location.pathname + "?" + query.join("&");
  }

  $("th").map(function (i, th) {
    th = $(th);
    var col = th.data("sort");
    if (!col || col.length === 0) {
      return;
    }
    var order = th.find("i").hasClass("fa-sort-desc") ? "asc" : "desc";
    th.find("a").click(function () {
      resort(col, order);
    });
  });

  $(".time-col").map(function (i, el) {
    // convert ISO datestamps to nice momentjs ones
    el = $(el);
    var m = moment(new Date(el.text().trim()));
    el.text(m.isValid() ? m.fromNow() : "Never");
  });

  $(".stop-server").click(function () {
    var el = $(this);
    var row = getRow(el);
    var serverName = row.data("server-name");
    var user = row.data("user");
    el.text("stopping...");
    var stop = function (options) {
      return api.stop_server(user, options);
    };
    if (serverName !== "") {
      stop = function (options) {
        return api.stop_named_server(user, serverName, options);
      };
    }
    stop({
      success: function () {
        el.text("stop " + serverName).addClass("hidden");
        row.find(".access-server").addClass("hidden");
        row.find(".start-server").removeClass("hidden");
      },
    });
  });

  $(".delete-server").click(function () {
    var el = $(this);
    var row = getRow(el);
    var serverName = row.data("server-name");
    var user = row.data("user");
    el.text("deleting...");
    api.delete_named_server(user, serverName, {
      success: function () {
        row.remove();
      },
    });
  });

  $(".access-server").map(function (i, el) {
    el = $(el);
    var row = getRow(el);
    var user = row.data("user");
    var serverName = row.data("server-name");
    el.attr(
      "href",
      utils.url_path_join(prefix, "user", user, serverName) + "/"
    );
  });

  if (admin_access && options_form) {
    // if admin access and options form are enabled
    // link to spawn page instead of making API requests
    $(".start-server").map(function (i, el) {
      el = $(el);
      var row = getRow(el);
      var user = row.data("user");
      var serverName = row.data("server-name");
      el.attr(
        "href",
        utils.url_path_join(prefix, "hub/spawn", user, serverName)
      );
    });
    // cannot start all servers in this case
    // since it would mean opening a bunch of tabs
    $("#start-all-servers").addClass("hidden");
  } else {
    $(".start-server").click(function () {
      var el = $(this);
      var row = getRow(el);
      var user = row.data("user");
      var serverName = row.data("server-name");
      el.text("starting...");
      var start = function (options) {
        return api.start_server(user, options);
      };
      if (serverName !== "") {
        start = function (options) {
          return api.start_named_server(user, serverName, options);
        };
      }
      start({
        success: function () {
          el.text("start " + serverName).addClass("hidden");
          row.find(".stop-server").removeClass("hidden");
          row.find(".access-server").removeClass("hidden");
        },
      });
    });
  }

  $(".edit-user").click(function () {
    var el = $(this);
    var row = getRow(el);
    var user = row.data("user");
    var admin = row.data("admin");
    var mailAddress = row.data("mail-address");
    var dialog = $("#edit-user-dialog");
    dialog.data("user", user);
    dialog.find(".username-input").val(user);
    dialog.find(".mail-address-input").val(mailAddress);
    dialog.find(".admin-checkbox").attr("checked", admin === "True");
    dialog.modal();
  });

  $("#edit-user-dialog")
    .find("#mail-address")
    .keyup(function () {
      $(this).change();
    });

  $("#edit-user-dialog")
    .find("#mail-address")
    .change(function () {
      var dialog = $("#edit-user-dialog");
      var mailAddress = dialog.find("#mail-address").val();
      var valid = mailAddress.match(/^\S+\@\S+$/) != null;
      dialog.find(".save-button").prop("disabled", !valid);
    });

  $("#edit-user-dialog")
    .find(".save-button")
    .click(function () {
      var dialog = $("#edit-user-dialog");
      var user = dialog.data("user");
      var name = dialog.find(".username-input").val();
      var admin = dialog.find(".admin-checkbox").prop("checked");
      var mailAddress = dialog.find(".mail-address-input").val();
      api.edit_user(
        user,
        {
          admin: admin,
          name: name,
          mail_address: mailAddress,
        },
        {
          success: function () {
            window.location.reload();
          },
        }
      );
    });

  $(".delete-user").click(function () {
    var el = $(this);
    var row = getRow(el);
    var user = row.data("user");
    var dialog = $("#delete-user-dialog");
    dialog.find(".delete-username").text(user);
    dialog.modal();
  });

  $("#delete-user-dialog")
    .find(".delete-button")
    .click(function () {
      var dialog = $("#delete-user-dialog");
      var username = dialog.find(".delete-username").text();
      console.log("deleting", username);
      api.delete_user(username, {
        success: function () {
          window.location.reload();
        },
      });
    });

  $("#add-users").click(function () {
    var dialog = $("#add-users-dialog");
    dialog.find(".username-input").val("");
    dialog.find(".admin-checkbox").prop("checked", false);
    dialog.modal();
  });

  $("#add-users-dialog")
    .find(".save-button")
    .click(function () {
      var dialog = $("#add-users-dialog");
      var lines = dialog.find(".username-input").val().split("\n");
      var admin = dialog.find(".admin-checkbox").prop("checked");
      var usernames = [];
      lines.map(function (line) {
        var username = line.trim();
        if (username.length) {
          usernames.push(username);
        }
      });

      api.add_users(
        usernames,
        { admin: admin },
        {
          success: function () {
            window.location.reload();
          },
        }
      );
    });

  $("#stop-all-servers").click(function () {
    $("#stop-all-servers-dialog").modal();
  });

  $("#start-all-servers").click(function () {
    $("#start-all-servers-dialog").modal();
  });

  $("#stop-all-servers-dialog")
    .find(".stop-all-button")
    .click(function () {
      // stop all clicks all the active stop buttons
      $(".stop-server").not(".hidden").click();
    });

  function start(el) {
    return function () {
      $(el).click();
    };
  }

  $("#start-all-servers-dialog")
    .find(".start-all-button")
    .click(function () {
      $(".start-server")
        .not(".hidden")
        .each(function (i) {
          setTimeout(start(this), i * 500);
        });
    });

  $("#shutdown-hub").click(function () {
    var dialog = $("#shutdown-hub-dialog");
    dialog.find("input[type=checkbox]").prop("checked", true);
    dialog.modal();
  });

  $("#shutdown-hub-dialog")
    .find(".shutdown-button")
    .click(function () {
      var dialog = $("#shutdown-hub-dialog");
      var servers = dialog.find(".shutdown-servers-checkbox").prop("checked");
      var proxy = dialog.find(".shutdown-proxy-checkbox").prop("checked");
      api.shutdown_hub({
        proxy: proxy,
        servers: servers,
      });
    });

  $(".mail-address-checkbox").change(function () {
    var checkedCount = $(".mail-address-checkbox:checked").length;
    if ($(".mail-address-checkbox").length - checkedCount == 0) {
      $("#mail-address-check-all").removeClass("fa-square");
      $("#mail-address-check-all").addClass("fa-check-square");
    } else {
      $("#mail-address-check-all").addClass("fa-square");
      $("#mail-address-check-all").removeClass("fa-check-square");
    }
    $("#send-notification").attr("disabled", checkedCount == 0);
  });

  $("#mail-address-check-all").click(function () {
    if ($("#mail-address-check-all").hasClass("fa-check-square")) {
      $("#mail-address-check-all").addClass("fa-square");
      $("#mail-address-check-all").removeClass("fa-check-square");
      $(".mail-address-checkbox").prop("checked", false);
      $("#send-notification").attr("disabled", true);
    } else {
      $("#mail-address-check-all").removeClass("fa-square");
      $("#mail-address-check-all").addClass("fa-check-square");
      $(".mail-address-checkbox").prop("checked", true);
      $("#send-notification").attr("disabled", false);
    }
  });

  $("#send-notification").click(function () {
    var dialog = $("#send-notification-dialog");
    dialog.find(".notification-loading").show();
    dialog.find(".notification-form").hide();
    api.get_notification_templates({
      success: function (data) {
        $(".notification-loading").hide();
        var default_templates = data.templates.filter((t) => t.default);
        if (default_templates.length > 0) {
          if (default_templates[0].subject !== null) {
            dialog
              .find(".notification-title-input")
              .val(default_templates[0].subject);
          }
          dialog
            .find(".notification-body-input")
            .val(default_templates[0].body);
        }
        if (data.templates && data.templates.length > 0) {
          var template_items = $("#notification-template-items");
          template_items.empty();
          data.templates.forEach(function (template) {
            notification_templates[template.name] = template;
            template_items.append($("<option></option>").append(template.name));
          });
          if (default_templates.length > 0) {
            template_items.val(default_templates[0].name);
          }
          dialog.find(".notification-templates").show();
        } else {
          dialog.find(".notification-templates").hide();
        }
        $(".notification-form").show();
      },
    });
    dialog.find(".send-notification-button").prop("disabled", true);
    dialog.find(".notification-title-input").val("");
    dialog.find(".notification-body-input").val("");
    dialog.modal();
  });

  $("#send-notification-dialog")
    .find(".notification-input")
    .keyup(function () {
      $(this).change();
    });

  $("#notification-template-insert").click(function () {
    var template =
      notification_templates[$("#notification-template-items").val()];
    var text = $(".notification-body-input");
    var v = text.val();
    var textBefore = v.substring(0, text.prop("selectionStart"));
    var textAfter = v.substring(text.prop("selectionEnd"), v.length);

    text.val(textBefore + template.body + textAfter);
  });

  $("#notification-template-reset").click(function () {
    var template =
      notification_templates[$("#notification-template-items").val()];
    $(".notification-body-input").val(template.body);
    if (template.subject !== null) {
      $(".notification-title-input").val(template.subject);
    }
  });

  $("#send-notification-dialog")
    .find(".notification-input")
    .change(function () {
      var dialog = $("#send-notification-dialog");
      var title = dialog.find(".notification-title-input").val();
      var body = dialog.find(".notification-body-input").val();
      var valid = title.length > 0 && body.length > 0;
      dialog.find(".send-notification-button").prop("disabled", !valid);
    });

  $(".send-notification-button").click(function () {
    var to = [];
    $(".mail-address-checkbox:checked").each(function (i, el) {
      to.push(getRow($(el)).data("user"));
    });
    api.send_notification({
      to: to,
      title: $(".notification-title-input").val(),
      body: $(".notification-body-input").val(),
    });
  });

  function ReLoadImages() {
    $('img[data-lazysrc]').each(function () {
          //* set the img src from data-src
          $(this).attr('src', $(this).attr('data-lazysrc'));
          $(this).attr('alt', "user not logged in");
        }
    );
  }

  setTimeout(() => ReLoadImages(), 100); // Set short delay to load image after scripts
});
