import React, { useState } from "react";
import regeneratorRuntime from "regenerator-runtime";
import { useSelector, useDispatch } from "react-redux";
import PropTypes from "prop-types";

import {
  Modal,
  Button,
  Col,
  Row,
  FormControl,
  Card,
  CardGroup,
  Collapse,
} from "react-bootstrap";
import ReactObjectTableViewer from "react-object-table-viewer";

import { Link } from "react-router-dom";
import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa";

import "./server-dashboard.css";
import { timeSince } from "../../util/timeSince";
import PaginationFooter from "../PaginationFooter/PaginationFooter";
import { useEffect } from "react";

const AccessServerButton = ({ url }) => (
  <a href={url || ""}>
    <button className="btn btn-primary btn-xs" style={{ marginRight: 20 }}>
      Access Server
    </button>
  </a>
);

const ServerDashboard = (props) => {
  let base_url = window.base_url;
  // sort methods
  var usernameDesc = (e) => e.sort((a, b) => (a.name > b.name ? 1 : -1)),
    usernameAsc = (e) => e.sort((a, b) => (a.name < b.name ? 1 : -1)),
    adminDesc = (e) => e.sort((a) => (a.admin ? -1 : 1)),
    adminAsc = (e) => e.sort((a) => (a.admin ? 1 : -1)),
    mailDesc = (e) => e.sort((a) => (a.mail ? -1 : 1)),
    mailAsc = (e) => e.sort((a) => (a.mail ? 1 : -1)),
    dateDesc = (e) =>
      e.sort((a, b) =>
        new Date(a.last_activity) - new Date(b.last_activity) > 0 ? -1 : 1
      ),
    dateAsc = (e) =>
      e.sort((a, b) =>
        new Date(a.last_activity) - new Date(b.last_activity) > 0 ? 1 : -1
      ),
    runningAsc = (e) => e.sort((a) => (a.server == null ? -1 : 1)),
    runningDesc = (e) => e.sort((a) => (a.server == null ? 1 : -1));

  var [errorAlert, setErrorAlert] = useState(null);
  var [sortMethod, setSortMethod] = useState(null);
  var [disabledButtons, setDisabledButtons] = useState({});
  const [collapseStates, setCollapseStates] = useState({});
  const [show, setShow] = useState(false);
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true)

  var user_data = useSelector((state) => state.user_data),
    user_page = useSelector((state) => state.user_page),
    limit = useSelector((state) => state.limit),
    name_filter = useSelector((state) => state.name_filter),
    page = parseInt(new URLSearchParams(props.location.search).get("page"));

  page = isNaN(page) ? 0 : page;
  var slice = [page * limit, limit, name_filter];

  const dispatch = useDispatch();
  const [isCheck, setIsCheck] = useState([]);
  var all_mail_address = [];

  const equals = (a, b) =>
    a.length === b.length &&
    a.every((v, i) => v === b[i]);

  const CheckedMail = (e) => {
    const { value, checked } = e.target;
    var tmpUsers = [];
    if (checked) {
      tmpUsers = [...isCheck, value];
    } else {
      tmpUsers = isCheck.filter(item => item !== value);
    }  
    setIsCheck(tmpUsers);
  }

  const CheckAll = (e) => {
    const {checked} = e.target;
    if (checked){
      setIsCheck(all_mail_address);
    } else {
      setIsCheck([]);
    }
  }

  // grafana reload image
  const grafana_src =
    "http://" +
    window.grafana_host +
    "/d/icjpCppik/k8-cluster-detail-dashboard";
  const grafana_img_alt = "";

  useEffect(() => {
    const timer = setTimeout(() => {
      grafana_img_alt = "user not logged in";
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  var {
    updateUsers,
    shutdownHub,
    startServer,
    stopServer,
    startAll,
    stopAll,
    history,
    getNotificationTemplates,
    sendNotification,
  } = props;

  var dispatchPageUpdate = (data, page, name_filter) => {
    dispatch({
      type: "USER_PAGE",
      value: {
        data: data,
        page: page,
        name_filter: name_filter,
      },
    });
  };

  const NotificationModal = (props) => {
    const [notificationState, setNotificationState] = useState({});
    const [templates, setTemplate] = useState(null);
    const [body, setBody] = useState("");
    const [title, setTitle] = useState("");
    
    useEffect (() => {
      getNotificationTemplates().then((data) => {
        setTemplate(data.templates);
        var tmpDefault = data.templates.find((t)=> {return t.default === true});
        if (tmpDefault) {
          setTitle(tmpDefault.subject);
          setBody(tmpDefault.body);
        }
      }).catch(setTemplate([])); 
    },[])

    const choiceTemplate = (e) => {
      if (e.target.value != "") {
        setNotificationState(templates.find((t) => {return t.name === e.target.value}));
      }
    }

    const setValue = () => {
      setTitle(notificationState.subject);
      setBody(notificationState.body);
    }

    const insertBody = () => {
      let tmpString = body;
      tmpString += '\n'
      tmpString += notificationState.body;
      setBody(tmpString);
    };
    
    const callSendNotification = () => {
      sendNotification(isCheck, title, body);
      props.handleClose();
    }
  
    let templateButton;
    if (templates?.length > 0) {
      templateButton = (
        <div class="notification-templates">
          Template: <select onChange={choiceTemplate}>
            <option value="">テンプレートを選択してください。</option>
            {templates.map((template) => <option value={template.name}>{template.name}</option>)}</select>
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
        </div>);
    } else {
      templateButton = ""
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
                onChange={(e)=>setTitle(e.target.value)}
              ></input>
            </div>
            <div>
              <label for="notification-body">Body</label>
              <textarea
                name="notification-body"
                class="form-control notification-input notification-body-input"
                rows="10"
                value={body}
                onChange={(e)=>setBody(e.target.value)}
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
            disabled={body=="" || title==""}
          >
            Send
          </Button>
        </Modal.Footer>
      </Modal>
    )
  }
  
  if (page != user_page) {
    updateUsers(...slice).then((data) =>
      dispatchPageUpdate(data, page, name_filter)
    );
  }

  var debounce = require("lodash.debounce");
  const handleSearch = debounce(async (event) => {
    // setNameFilter(event.target.value);
    updateUsers(page * limit, limit, event.target.value).then((data) =>
      dispatchPageUpdate(data, page, name_filter)
    );
  }, 300);

  if (sortMethod != null) {
    user_data = sortMethod(user_data);
  }

  if (!user_data) {
    return <div data-testid="no-show"></div>;
  } else {
    all_mail_address = user_data.flatMap(u => u.name);
  } 
  
  const StopServerButton = ({ serverName, userName }) => {
    var [isDisabled, setIsDisabled] = useState(false);
    return (
      <button
        className="btn btn-danger btn-xs stop-button"
        disabled={isDisabled}
        onClick={() => {
          setIsDisabled(true);
          stopServer(userName, serverName)
            .then((res) => {
              if (res.status < 300) {
                updateUsers(...slice)
                  .then((data) => {
                    dispatchPageUpdate(data, page, name_filter);
                  })
                  .catch(() => {
                    setIsDisabled(false);
                    setErrorAlert(`Failed to update users list.`);
                  });
              } else {
                setErrorAlert(`Failed to stop server.`);
                setIsDisabled(false);
              }
              return res;
            })
            .catch(() => {
              setErrorAlert(`Failed to stop server.`);
              setIsDisabled(false);
            });
        }}
      >
        Stop Server
      </button>
    );
  };

  const StartServerButton = ({ serverName, userName }) => {
    var [isDisabled, setIsDisabled] = useState(false);
    return (
      <button
        className="btn btn-success btn-xs start-button"
        disabled={isDisabled}
        onClick={() => {
          setIsDisabled(true);
          startServer(userName, serverName)
            .then((res) => {
              if (res.status < 300) {
                updateUsers(...slice)
                  .then((data) => {
                    dispatchPageUpdate(data, page, name_filter);
                  })
                  .catch(() => {
                    setErrorAlert(`Failed to update users list.`);
                    setIsDisabled(false);
                  });
              } else {
                setErrorAlert(`Failed to start server.`);
                setIsDisabled(false);
              }
              return res;
            })
            .catch(() => {
              setErrorAlert(`Failed to start server.`);
              setIsDisabled(false);
            });
        }}
      >
        Start Server
      </button>
    );
  };

  const EditUserCell = ({ user }) => {
    return (
      <td>
        <button
          className="btn btn-primary btn-xs"
          style={{ marginRight: 20 }}
          onClick={() =>
            history.push({
              pathname: "/edit-user",
              state: {
                username: user.name,
                has_admin: user.admin,
              },
            })
          }
        >
          Edit User
        </button>
      </td>
    );
  };

  const ServerRowTable = ({ data }) => {
    return (
      <ReactObjectTableViewer
        className="table-striped table-bordered"
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
        data={data}
      />
    );
  };

  const serverRow = (user, server) => {
    const { servers, ...userNoServers } = user;
    const serverNameDash = server.name ? `-${server.name}` : "";
    const userServerName = user.name + serverNameDash;
    const open = collapseStates[userServerName] || false;
    return [
      <tr key={`${userServerName}-row`} className="user-row">
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
              <span className="caret"></span>
            </Button>{" "}
          </span>
          <span data-testid={`user-name-div-${userServerName}`}>
            {user.name}
          </span>
        </td>
        <td data-testid="user-row-admin">{user.admin ? "admin" : ""}</td>
        <td data-testid="user-row-mail">
                    {!server.name && user.mail_address ? (
                      <>
                        <input
                          type="checkbox"
                          className="mail-address-checkbox"
                          style={{ marginRight: "10px" }}
                          value = {user.name}
                          onChange={CheckedMail}
                          checked={isCheck.includes(user.name)}
                        />
                        {user.mail_address}
                      </>
                    ) : (
                      <>-</>
                    )}
        </td>
        <td data-testid="user-row-server">
          {server.name ? (
            <p className="text-secondary">{server.name}</p>
          ) : (
            <p style={{ color: "lightgrey" }}>[MAIN]</p>
          )}
        </td>
        <td data-testid="user-row-last-activity">
          {server.last_activity ? timeSince(server.last_activity) : "Never"}
        </td>
        <td data-testid="user-row-server-activity">
          {server.started ? (
            // Stop Single-user server
            <>
              <StopServerButton serverName={server.name} userName={user.name} />
              <AccessServerButton url={server.url} />
            </>
          ) : (
            // Start Single-user server
            <>
              <StartServerButton
                serverName={server.name}
                userName={user.name}
                style={{ marginRight: 20 }}
              />
              <a
                  href={base_url + "spawn/" + user.name + (server.name ? "/" + server.name : "")}
              >
                <button
                  className="btn btn-secondary btn-xs"
                  style={{ marginRight: 20 }}
                >
                  Spawn Page
                </button>
              </a>
            </>
          )}
        </td>
        <EditUserCell user={user} />
      </tr>,
      <tr>
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
      {errorAlert != null ? (
        <div className="row">
          <div className="col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2">
            <div className="alert alert-danger">
              {errorAlert}
              <button
                type="button"
                className="close"
                onClick={() => setErrorAlert(null)}
              >
                <span>&times;</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <></>
      )}

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
        <Row>
          <Col md={4}>
            <FormControl
              type="text"
              name="user_search"
              placeholder="Search users"
              aria-label="user-search"
              defaultValue={name_filter}
              onChange={handleSearch}
            />
          </Col>

          <Col md="auto" style={{ float: "right", margin: 15 }}>
            <Link to="/groups">{"> Manage Groups"}</Link>
          </Col>
        </Row>
        <table className="table table-bordered table-hover">
          <thead className="admin-table-head">
            <tr>
              <th id="user-header">
                User{" "}
                <SortHandler
                  sorts={{ asc: usernameAsc, desc: usernameDesc }}
                  callback={(method) => setSortMethod(() => method)}
                  testid="user-sort"
                />
              </th>
              <th id="admin-header">
                Admin{" "}
                <SortHandler
                  sorts={{ asc: adminAsc, desc: adminDesc }}
                  callback={(method) => setSortMethod(() => method)}
                  testid="admin-sort"
                />
              </th>
              <th id="mail-header">
                Mail Address{" "}
                <SortHandler
                  sorts={{ asc: mailAsc, desc: mailDesc }}
                  callback={(method) => setSortMethod(() => method)}
                  testid="mail-sort"
                />
              </th>
              <th id="server-header">
                Server{" "}
                <SortHandler
                  sorts={{ asc: usernameAsc, desc: usernameDesc }}
                  callback={(method) => setSortMethod(() => method)}
                  testid="server-sort"
                />
              </th>
              <th id="last-activity-header">
                Last Activity{" "}
                <SortHandler
                  sorts={{ asc: dateAsc, desc: dateDesc }}
                  callback={(method) => setSortMethod(() => method)}
                  testid="last-activity-sort"
                />
              </th>
              <th id="running-status-header">
                Running{" "}
                <SortHandler
                  sorts={{ asc: runningAsc, desc: runningDesc }}
                  callback={(method) => setSortMethod(() => method)}
                  testid="running-status-sort"
                />
              </th>
              <th id="actions-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr className="noborder">
              <td>
                <Button variant="light" className="add-users-button">
                  <Link to="/add-users">Add Users</Link>
                </Button>
              </td>
              <td></td>
              <td>
                {/* <i id="mail-address-check-all" className="fa fa-check-square"></i> */}
                <input type="checkbox"
                  onChange={CheckAll}
                  checked={equals(isCheck, all_mail_address)}
                />
                {/*<button id="send-notification" className="btn btn-default" style={{marginLeft: "10px"}} disabled>Notify</button>*/}
                <Button
                  id="send-notification"
                  variant="light"
                  style={{ marginLeft: "10px" }}
                  onClick={handleShow}
                  disabled={isCheck.length<=0}
                >
                  Notify
                </Button>
              </td>
              <td>
                {/* Start all servers */}
                <Button
                  variant="primary"
                  className="start-all"
                  data-testid="start-all"
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
                            } already running?`
                          );
                        }
                        return res;
                      })
                      .then((res) => {
                        updateUsers(...slice)
                          .then((data) => {
                            dispatchPageUpdate(data, page, name_filter);
                          })
                          .catch(() =>
                            setErrorAlert(`Failed to update users list.`)
                          );
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
                            } already stopped?`
                          );
                        }
                        return res;
                      })
                      .then((res) => {
                        updateUsers(...slice)
                          .then((data) => {
                            dispatchPageUpdate(data, page, name_filter);
                          })
                          .catch(() =>
                            setErrorAlert(`Failed to update users list.`)
                          );
                        return res;
                      })
                      .catch(() => setErrorAlert(`Failed to stop servers.`));
                  }}
                >
                  Stop All
                </Button>
              </td>
              <td>
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
          endpoint="/"
          page={page}
          limit={limit}
          numOffset={slice[0]}
          numElements={user_data.length}
        />
        <br></br>
      </div>
      <NotificationModal handleClose={handleClose}/>
    </div>
  );
};

ServerDashboard.propTypes = {
  user_data: PropTypes.array,
  updateUsers: PropTypes.func,
  shutdownHub: PropTypes.func,
  startServer: PropTypes.func,
  stopServer: PropTypes.func,
  startAll: PropTypes.func,
  stopAll: PropTypes.func,
  dispatch: PropTypes.func,
  history: PropTypes.shape({
    push: PropTypes.func,
  }),
  location: PropTypes.shape({
    search: PropTypes.string,
  }),
};

const SortHandler = (props) => {
  var { sorts, callback, testid } = props;

  var [direction, setDirection] = useState(undefined);

  return (
    <div
      className="sort-icon"
      data-testid={testid}
      onClick={() => {
        if (!direction) {
          callback(sorts.desc);
          setDirection("desc");
        } else if (direction == "asc") {
          callback(sorts.desc);
          setDirection("desc");
        } else {
          callback(sorts.asc);
          setDirection("asc");
        }
      }}
    >
      {!direction ? (
        <FaSort />
      ) : direction == "asc" ? (
        <FaSortDown />
      ) : (
        <FaSortUp />
      )}
    </div>
  );
};

function ReLoadImages() {
  $("img[data-lazysrc]").each(function () {
    //* set the img src from data-src
    $(this).attr("src", $(this).attr("data-lazysrc"));
    $(this).attr("alt", "user not logged in");
  });
}

SortHandler.propTypes = {
  sorts: PropTypes.object,
  callback: PropTypes.func,
  testid: PropTypes.string,
};

export default ServerDashboard;
