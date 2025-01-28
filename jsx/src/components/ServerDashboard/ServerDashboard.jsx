import React, { useEffect, useState, Fragment } from "react";
import { useSelector, useDispatch } from "react-redux";
import { debounce } from "lodash";
import PropTypes from "prop-types";
import ErrorAlert from "../../util/error";

import {
  Modal,
  Button,
  Col,
  Row,
  Form,
  FormControl,
  Card,
  CardGroup,
  Collapse,
} from "react-bootstrap";
import ReactObjectTableViewer from "../ReactObjectTableViewer/ReactObjectTableViewer";

import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa";

import "./server-dashboard.css";
import { timeSince } from "../../util/timeSince";
import { usePaginationParams } from "../../util/paginationParams";
import PaginationFooter from "../PaginationFooter/PaginationFooter";

const RowListItem = ({ text }) => (
  <span className="server-dashboard-row-list-item">{text}</span>
);
RowListItem.propTypes = {
  text: PropTypes.string,
};

const ServerDashboard = (props) => {
  const base_url = window.base_url || "/";
  const [searchParams, setSearchParams] = useSearchParams();

  const [errorAlert, setErrorAlert] = useState(null);
  const [collapseStates, setCollapseStates] = useState({});
  const [show, setShow] = useState(false);
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  let user_data = useSelector((state) => state.user_data);
  const user_page = useSelector((state) => state.user_page);

  const { offset, setLimit, handleLimit, limit, setPagination } =
    usePaginationParams();

  const name_filter = searchParams.get("name_filter") || "";
  const sort = searchParams.get("sort") || "id";
  const state_filter = searchParams.get("state") || "";

  const total = user_page ? user_page.total : undefined;

  const dispatch = useDispatch();
  const [checkedUsers, setCheckedUsers] = useState([]);
  var users_with_mail = [];

  const equals = (a, b) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  const CheckedMail = (e) => {
    const { value, checked } = e.target;
    var tmpUsers = [];
    if (checked) {
      tmpUsers = [...checkedUsers, value];
    } else {
      tmpUsers = checkedUsers.filter((item) => item !== value);
    }
    setCheckedUsers(tmpUsers);
  };

  const CheckAll = (e) => {
    const { checked } = e.target;
    if (checked) {
      setCheckedUsers(users_with_mail);
    } else {
      setCheckedUsers([]);
    }
  };

  // grafana reload image
  const grafana_src =
    "http://" +
    window.grafana_host +
    "/d/icjpCppik/k8-cluster-detail-dashboard";
  const grafana_img_alt = "user not logged in";
  const navigate = useNavigate();

  var {
    updateUsers,
    shutdownHub,
    startServer,
    stopServer,
    deleteServer,
    startAll,
    stopAll,
    getNotificationTemplates,
    sendNotification,
  } = props;

  const dispatchPageUpdate = (data, page) => {
    // trigger page update in state
    // in response to fetching updated user list
    // data is list of user records
    // page is _pagination part of response
    // persist page info in url query
    setPagination(page);
    // persist user data, triggers rerender
    dispatch({
      type: "USER_PAGE",
      value: {
        data: data,
        page: page,
      },
    });
  };

  const setNameFilter = (new_name_filter) => {
    // persist ?name_filter parameter
    // store in url param, clear when value is empty
    setSearchParams((params) => {
      // clear offset when name filter changes
      if (new_name_filter !== name_filter) {
        params.delete("offset");
      }
      if (new_name_filter) {
        params.set("name_filter", new_name_filter);
      } else {
        params.delete("name_filter");
      }
      return params;
    });
  };

  const setSort = (sort) => {
    // persist ?sort parameter
    // store in url param, clear when value is default ('id')
    setSearchParams((params) => {
      if (sort === "id") {
        params.delete("id");
      } else {
        params.set("sort", sort);
      }
      return params;
    });
  };

  const NotificationModal = (props) => {
    const [notificationState, setNotificationState] = useState({});
    const [templates, setTemplates] = useState(null);
    const [body, setBody] = useState("");
    const [title, setTitle] = useState("");

    useEffect(() => {
      if (!getNotificationTemplates) {
        console.warn("function getNotificationTemplates not defined");
        return;
      }
      getNotificationTemplates()
        .then((data) => {
          if (data.templates) {
            setTemplates(data.templates);
            var tmpDefault = data.templates.find((t) => {
              return t.default === true;
            });
            if (tmpDefault) {
              setTitle(tmpDefault.subject);
              setBody(tmpDefault.body);
            }
          }
        })
        .catch(setTemplates([]));
    }, []);

    const selectTemplate = (e) => {
      if (e.target.value != "") {
        setNotificationState(
          templates.find((t) => {
            return t.name === e.target.value;
          })
        );
      }
    };

    const setValue = () => {
      setTitle(notificationState.subject);
      setBody(notificationState.body);
    };

    const insertBody = () => {
      let tmpString = body;
      tmpString += "\n";
      tmpString += notificationState.body;
      setBody(tmpString);
    };

    const callSendNotification = () => {
      sendNotification(checkedUsers, title, body);
      props.handleClose();
    };

    let templateButton;
    if (templates?.length > 0) {
      templateButton = (
        <div class="notification-templates">
          Template:{" "}
          <select onChange={selectTemplate}>
            <option value="">テンプレートを選択してください。</option>
            {templates.map((template) => (
              <option value={template.name}>{template.name}</option>
            ))}
          </select>
          <button
            style={{ marginLeft: "10px" }}
            class="btn btn-default btn-xs"
            onClick={setValue}
          >
            Set
          </button>
          <button
            style={{ marginLeft: "10px" }}
            class="btn btn-default btn-xs"
            // id="notification-template-insert"
            onClick={insertBody}
          >
            Insert to body
          </button>
        </div>
      );
    } else {
      templateButton = "";
    }
    return (
      <Modal
        animation={true}
        show={show}
        onHide={props.handleClose}
        // id="send-notification-dialog"
      >
        <Modal.Header closeButton>
          <Modal.Title>Send Notification</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div class="notification-form">
            {templateButton}
            <div>
              <label for="notification-title">Subject</label>
              <input
                type="text"
                // name="notification-title"
                // id="notification-title"
                class="form-control notification-input notification-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              ></input>
            </div>
            <div>
              <label for="notification-body">Body</label>
              <textarea
                name="notification-body"
                class="form-control notification-input notification-body-input"
                rows="10"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              ></textarea>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={props.handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary send-notification-button"
            onClick={callSendNotification}
            disabled={body == "" || title == ""}
          >
            Send
          </Button>
        </Modal.Footer>
      </Modal>
    );
  };
  const setStateFilter = (new_state_filter) => {
    // persist ?state filter
    // store in url param, clear when value is default ('')
    setSearchParams((params) => {
      // clear offset when filter changes
      if (new_state_filter !== state_filter) {
        params.delete("offset");
      }
      if (!new_state_filter) {
        params.delete("state");
      } else {
        params.set("state", new_state_filter);
      }
      return params;
    });
  };

  // the callback to update the displayed user list
  const updateUsersWithParams = (params) => {
    if (params) {
      if (params.offset !== undefined && params.offset < 0) {
        params.offset = 0;
      }
    }
    return updateUsers({
      offset: offset,
      limit,
      name_filter,
      sort,
      state: state_filter,
      ...params,
    });
  };

  // single callback to reload the page
  // uses current state, or params can be specified if state
  // should be updated _after_ load, e.g. offset
  const loadPageData = (params) => {
    return updateUsersWithParams(params)
      .then((data) => dispatchPageUpdate(data.items, data._pagination))
      .catch((err) => setErrorAlert("Failed to update user list."));
  };

  useEffect(() => {
    loadPageData();
  }, [limit, name_filter, sort, state_filter]);

  if (!user_data || !user_page) {
    return <div data-testid="no-show"></div>;
  }

  const handleSearch = debounce(async (event) => {
    setNameFilter(event.target.value);
  }, 300);

  if (!user_data) {
    return <div data-testid="no-show"></div>;
  } else {
    users_with_mail = user_data
      .filter((u) => u.mail_address)
      .flatMap((u) => u.name);
  }

  const ServerButton = ({
    server,
    user,
    action,
    name,
    variant,
    extraClass,
  }) => {
    var [isDisabled, setIsDisabled] = useState(false);
    return (
      <Button
        size="xs"
        variant={variant}
        className={extraClass}
        disabled={isDisabled || server.pending}
        onClick={() => {
          setIsDisabled(true);
          action(user.name, server.name)
            .then((res) => {
              if (res.status < 300) {
                loadPageData();
              } else {
                setErrorAlert(`Failed to ${name.toLowerCase()}.`);
                setIsDisabled(false);
              }
              return res;
            })
            .catch(() => {
              setErrorAlert(`Failed to ${name.toLowerCase()}.`);
              setIsDisabled(false);
            });
        }}
      >
        {name}
      </Button>
    );
  };

  const StopServerButton = ({ server, user }) => {
    if (!server.ready) {
      return null;
    }
    return ServerButton({
      server,
      user,
      action: stopServer,
      name: "Stop Server",
      variant: "danger",
      extraClass: "stop-button",
    });
  };
  const DeleteServerButton = ({ server, user }) => {
    if (!server.name) {
      // It's not possible to delete unnamed servers
      return null;
    }
    if (server.ready || server.pending) {
      return null;
    }
    return ServerButton({
      server,
      user,
      action: deleteServer,
      name: "Delete Server",
      variant: "danger",
      extraClass: "stop-button",
    });
  };

  const StartServerButton = ({ server, user }) => {
    if (server.ready) {
      return null;
    }
    return ServerButton({
      server,
      user,
      action: startServer,
      name: server.pending ? "Server is pending" : "Start Server",
      variant: "success",
      extraClass: "start-button",
    });
  };

  const SpawnPageButton = ({ server, user }) => {
    if (server.ready) {
      return null;
    }
    return (
      <a
        href={`${base_url}spawn/${user.name}${
          server.name ? "/" + server.name : ""
        }`}
      >
        <Button variant="light" size="xs">
          Spawn Page
        </Button>
      </a>
    );
  };

  const AccessServerButton = ({ server }) => {
    if (!server.ready) {
      return null;
    }
    return (
      <a href={server.url || ""}>
        <Button variant="primary" size="xs">
          Access Server
        </Button>
      </a>
    );
  };

  const EditUserButton = ({ user }) => {
    return (
      <Button
        size="xs"
        variant="light"
        onClick={() =>
          navigate("/edit-user", {
            state: {
              username: user.name,
              has_admin: user.admin,
            },
          })
        }
      >
        Edit User
      </Button>
    );
  };

  const ServerRowTable = ({ data }) => {
    const sortedData = Object.keys(data)
      .sort()
      .reduce(function (result, key) {
        let value = data[key];
        switch (key) {
          case "last_activity":
          case "created":
          case "started":
            // format timestamps
            value = value ? timeSince(value) : value;
            break;
        }
        if (Array.isArray(value)) {
          value = (
            <Fragment>
              {value.sort().flatMap((v) => (
                <RowListItem text={v} />
              ))}
            </Fragment>
          );
        }
        result[key] = value;
        return result;
      }, {});
    return (
      <ReactObjectTableViewer
        className="table table-striped table-bordered"
        style={{
          padding: "3px 6px",
          margin: "auto",
        }}
        keyStyle={{
          padding: "4px",
        }}
        valueStyle={{
          padding: "4px",
        }}
        data={sortedData}
      />
    );
  };

  const serverRow = (user, server) => {
    const { servers, ...userNoServers } = user;
    const serverNameDash = server.name ? `-${server.name}` : "";
    const userServerName = user.name + serverNameDash;
    const open = collapseStates[userServerName] || false;
    return [
      <tr
        key={`${userServerName}-row`}
        data-testid={`user-row-${userServerName}`}
        className="user-row"
      >
        <td data-testid="user-row-name">
          <span>
            <Button
              onClick={() =>
                setCollapseStates({
                  ...collapseStates,
                  [userServerName]: !open,
                })
              }
              aria-controls={`${userServerName}-collapse`}
              aria-expanded={open}
              data-testid={`${userServerName}-collapse-button`}
              variant={open ? "secondary" : "primary"}
              size="sm"
            >
              <span className="fa fa-caret-down"></span>
            </Button>{" "}
          </span>
          <span data-testid={`user-name-div-${userServerName}`}>
            {user.name}
          </span>
        </td>
        <td data-testid="user-row-mail">
          {!server.name && user.mail_address ? (
            <>
              <input
                type="checkbox"
                className="mail-address-checkbox"
                style={{ marginRight: "10px" }}
                value={user.name}
                onChange={CheckedMail}
                checked={checkedUsers.includes(user.name)}
              />
              {user.mail_address}
            </>
          ) : (
            <>-</>
          )}
        </td>
        <td data-testid="user-row-admin">{user.admin ? "admin" : ""}</td>
        <td data-testid="user-row-server">
          <p className="text-secondary">{server.name}</p>
        </td>
        <td data-testid="user-row-last-activity">
          {server.last_activity ? timeSince(server.last_activity) : "Never"}
        </td>
        <td data-testid="user-row-server-activity" className="actions">
          <StartServerButton server={server} user={user} />
          <StopServerButton server={server} user={user} />
          <DeleteServerButton server={server} user={user} />
          <AccessServerButton server={server} />
          <SpawnPageButton server={server} user={user} />
          <EditUserButton user={user} />
        </td>
      </tr>,
      <tr key={`${userServerName}-detail`}>
        <td
          colSpan={6}
          style={{ padding: 0 }}
          data-testid={`${userServerName}-td`}
        >
          <Collapse in={open} data-testid={`${userServerName}-collapse`}>
            <CardGroup
              id={`${userServerName}-card-group`}
              style={{ width: "100%", margin: "0 auto", float: "none" }}
            >
              <Card style={{ width: "100%", padding: 3, margin: "0 auto" }}>
                <Card.Title>User</Card.Title>
                <ServerRowTable data={userNoServers} />
              </Card>
              <Card style={{ width: "100%", padding: 3, margin: "0 auto" }}>
                <Card.Title>Server</Card.Title>
                <ServerRowTable data={server} />
              </Card>
            </CardGroup>
          </Collapse>
        </td>
      </tr>,
    ];
  };

  let servers = user_data.flatMap((user) => {
    let userServers = Object.values({
      "": user.server || {},
      ...(user.servers || {}),
    });
    return userServers.map((server) => [user, server]);
  });

  return (
    <div className="container" data-testid="container">
      <ErrorAlert errorAlert={errorAlert} setErrorAlert={setErrorAlert} />

      <div style={{ float: "left" }}>
        <h3>CPU usage</h3>
        <a href={grafana_src}>
          <img
            src="/hub/grafana_cpu_panel"
            id="cpuMetric"
            alt={grafana_img_alt}
          />
        </a>
      </div>
      <div>
        <h3>Memory usage</h3>
        <a href={grafana_src}>
          <img src="/hub/grafana_memory_panel" alt={grafana_img_alt} />
        </a>
      </div>
      <div className="server-dashboard-container">
        <Row className="rows-cols-lg-auto g-3 mb-3 align-items-center">
          <Col md={4} style={{ paddingTop: 15 }}>
            <FormControl
              type="text"
              name="user_search"
              placeholder="Search users"
              aria-label="user-search"
              defaultValue={name_filter}
              onChange={handleSearch}
            />
          </Col>
          <Col md={4}>
            <Form.Check
              inline
              title="check to only show running servers, otherwise show all"
            >
              <Form.Check.Input
                type="checkbox"
                name="active_servers"
                id="active-servers-filter"
                checked={state_filter == "active"}
                onChange={(event) => {
                  setStateFilter(event.target.checked ? "active" : null);
                }}
              />
              <Form.Check.Label htmlFor="active-servers-filter">
                {"only active servers"}
              </Form.Check.Label>
            </Form.Check>
          </Col>

          <Col md={{ span: 3, offset: 1 }}>
            <Link to="/groups">
              <Button variant="light" className="form-control">
                {"Manage Groups"}
              </Button>
            </Link>
          </Col>
        </Row>
        <table className="table table-bordered table-hover">
          <thead className="admin-table-head">
            <tr>
              <th id="user-header">
                User{" "}
                <SortHandler
                  currentSort={sort}
                  setSort={setSort}
                  sortKey="name"
                  testid="user-sort"
                />
              </th>
              <th id="mail-header">
                Mail Address{" "}
                <SortHandler
                  currentSort={sort}
                  setSort={setSort}
                  sortKey="mail_address"
                  testid="mail-sort"
                />
              </th>
              <th id="admin-header">Admin</th>
              <th id="server-header">Server</th>
              <th id="last-activity-header">
                Last Activity{" "}
                <SortHandler
                  currentSort={sort}
                  setSort={setSort}
                  sortKey="last_activity"
                  testid="last-activity-sort"
                />
              </th>
              <th id="actions-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr className="noborder">
              <td>
                <Link to="/add-users">
                  <Button variant="light" className="add-users-button">
                    Add Users
                  </Button>
                </Link>
              </td>
              <td>
                {/* <i id="mail-address-check-all" className="fa fa-check-square"></i> */}
                <input
                  type="checkbox"
                  onChange={CheckAll}
                  checked={equals(checkedUsers, users_with_mail)}
                />
                {/*<button id="send-notification" className="btn btn-default" style={{marginLeft: "10px"}} disabled>Notify</button>*/}
                <Button
                  id="send-notification"
                  variant="light"
                  style={{ marginLeft: "10px" }}
                  onClick={handleShow}
                  disabled={checkedUsers.length <= 0}
                >
                  Notify
                </Button>
              </td>
              <td colSpan={4} className="admin-header-buttons">
                {/* Start all servers */}
                <Button
                  variant="primary"
                  className="start-all"
                  data-testid="start-all"
                  title="start all servers on the current page"
                  onClick={() => {
                    Promise.all(startAll(user_data.map((e) => e.name)))
                      .then((res) => {
                        let failedServers = res.filter((e) => !e.ok);
                        if (failedServers.length > 0) {
                          setErrorAlert(
                            `Failed to start ${failedServers.length} ${
                              failedServers.length > 1 ? "servers" : "server"
                            }. ${
                              failedServers.length > 1 ? "Are they " : "Is it "
                            } already running?`,
                          );
                        }
                        return res;
                      })
                      .then((res) => {
                        loadPageData();
                        return res;
                      })
                      .catch(() => setErrorAlert(`Failed to start servers.`));
                  }}
                >
                  Start All
                </Button>
                <span> </span>
                {/* Stop all servers */}
                <Button
                  variant="danger"
                  className="stop-all"
                  data-testid="stop-all"
                  title="stop all servers on the current page"
                  onClick={() => {
                    Promise.all(stopAll(user_data.map((e) => e.name)))
                      .then((res) => {
                        let failedServers = res.filter((e) => !e.ok);
                        if (failedServers.length > 0) {
                          setErrorAlert(
                            `Failed to stop ${failedServers.length} ${
                              failedServers.length > 1 ? "servers" : "server"
                            }. ${
                              failedServers.length > 1 ? "Are they " : "Is it "
                            } already stopped?`,
                          );
                        }
                        return res;
                      })
                      .then((res) => {
                        loadPageData();
                        return res;
                      })
                      .catch(() => setErrorAlert(`Failed to stop servers.`));
                  }}
                >
                  Stop All
                </Button>
                {/* spacing between start/stop and Shutdown */}
                <span style={{ marginLeft: "30px" }}> </span>
                {/* Shutdown Jupyterhub */}
                <Button
                  variant="danger"
                  id="shutdown-button"
                  onClick={shutdownHub}
                >
                  Shutdown Hub
                </Button>
              </td>
            </tr>
            {servers.flatMap(([user, server]) => serverRow(user, server))}
          </tbody>
        </table>
        <PaginationFooter
          offset={offset}
          limit={limit}
          visible={user_data.length}
          total={total}
          // don't trigger via setOffset state change,
          // which can cause infinite cycles.
          // offset state will be set upon reply via setPagination
          next={() => loadPageData({ offset: offset + limit })}
          prev={() =>
            loadPageData({ offset: limit > offset ? 0 : offset - limit })
          }
          handleLimit={handleLimit}
        />
        <br></br>
      </div>
      <NotificationModal handleClose={handleClose} />
    </div>
  );
};

ServerDashboard.propTypes = {
  user_data: PropTypes.array,
  updateUsers: PropTypes.func,
  shutdownHub: PropTypes.func,
  startServer: PropTypes.func,
  stopServer: PropTypes.func,
  deleteServer: PropTypes.func,
  startAll: PropTypes.func,
  stopAll: PropTypes.func,
  dispatch: PropTypes.func,
  getNotificationTemplates: PropTypes.func,
  sendNotification: PropTypes.func,
};

const SortHandler = (props) => {
  const { currentSort, setSort, sortKey, testid } = props;

  const currentlySorted = currentSort && currentSort.endsWith(sortKey);
  const descending = currentSort && currentSort.startsWith("-");
  return (
    <div
      className="sort-icon"
      data-testid={testid}
      onClick={() => {
        if (!currentlySorted) {
          setSort(sortKey);
        } else if (descending) {
          setSort(sortKey);
        } else {
          setSort("-" + sortKey);
        }
      }}
    >
      {!currentlySorted ? (
        <FaSort />
      ) : descending ? (
        <FaSortDown />
      ) : (
        <FaSortUp />
      )}
    </div>
  );
};

SortHandler.propTypes = {
  currentSort: PropTypes.string,
  setSort: PropTypes.func,
  sortKey: PropTypes.string,
  testid: PropTypes.string,
};

export default ServerDashboard;
