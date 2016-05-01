function super_ops () {
	var express = require("express");
	var app = express();

	// set the view engine to ejs
	app.set('view engine', 'ejs');
	app.use(express.static(__dirname + './views'));
	app.use(express.static(__dirname + './static'));
	app.use(express.static(__dirname + './bower_components'));

	// favicon
	var favicon = require('serve-favicon');
	app.use(favicon(__dirname + '/static/favicon.ico'));

	var port = process.env.PORT || 8080; 


	// this will let us get the data from a POST
	var bodyParser = require("body-parser");
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({ extended: true }));

	// bcrypt setup
	var uuid = require('node-uuid');

	var emailUser = require('./utils/emailError.js').emailUser;
	var emailUserPW = function (text, send_to, cb) {
		emailUser(credentials, text, send_to, cb);
	};

	// attach to MySQL db and start server
	var fs = require("fs");
	var credentials, mysql, pool, sqlite3, usersDB;
	fs.readFile("credentials.json", "utf8", function (err, data) {
		if (err) throw err;
		credentials = JSON.parse(data);

		mysql = require("mysql");
		pool = mysql.createPool({
			connectionLimit: 100, //important
			host: credentials.host,
			user: credentials.user,
			password: credentials.password,
			database: credentials.database,
			debug: false
		});

		pool.getConnection(function (err, connection) {
			try { connection.release(); } catch (e) { console.log("Error on connection release: ", e) }
			if (err && false) {
				console.log("Connection to MySQL server failed.");
			} else {

				// now attach to local sqlite3 user accounts
				sqlite3 = require('sqlite3').verbose();
				usersDB = new sqlite3.Database('database/users.db');
				usersDB.run("CREATE TABLE if not exists activity (who TEXT, api INTEGER, path TEXT, date TEXT);", function () {
					usersDB.run("CREATE TABLE if not exists users (email TEXT, password TEXT, token TEXT, organization TEXT, last_req TEXT);", function () {
						var q = "PRAGMA table_info(users)";
						usersDB.all(q, function (err, res) {
							if (err) {
								console.log("Server failed to start, SQLITE3 database errors occurred.");
							} else {
								var schemaBad = false;
								res.map(function (ea) { return {type: ea.type, name: ea.name }; });
								res.forEach(function (ea) { if (ea.type !== "TEXT") { schemaBad = true; } });

								var reference = ["email", "xp", "token", "organization", "last_req"];
								res.forEach(function (ea, i) { if (reference[i] !== ea.name) { schemaBad = true; } });

								// designed to only handle old pw col name issue
								if (schemaBad) {
									usersDB.serialize(function() {
									  usersDB.run("ALTER TABLE users RENAME TO users_temp;");
									  usersDB.run("CREATE TABLE users (email TEXT, xp TEXT, token TEXT, organization TEXT, last_req TEXT);");
								    usersDB.run("INSERT INTO users(email, xp, token, organization, last_req) SELECT email, password, token, organization, last_req FROM users_temp;");
								    usersDB.run("DROP TABLE users_temp;", function () { startServer(); });
									});
								} else {
									startServer();
								}
							}
						});
					});
				});
			}
		});
	});


	// pool manager for mysql connections
	function handle_database (query, cb) {
		pool.getConnection(function (err, connection) {
			if (err) {
				connection.release();
				cb({"code" : 100, "status" : "Error in connection database"});
			} else {
				connection.query(query, function (err, rows) {
					connection.release();
					cb(err, rows);
				});

				// error handling on streamed response
				connection.on("error", function (err) {      
					cb({"code" : 100, "status" : "Error in connection database"});
				});
			}
		});
	};


	// log queries and access attempts each time
	app.use(function (req, res, next){
		var path = req.url;
		var who = "public", api = 0;
		if (path.split("/")[1] !== "api") {
			var q2 = "INSERT INTO activity VALUES ('" + who + "', '" + api + "', '" + path + "', '" + Date.now() + "');";
			usersDB.run(q2, function (err, row) {
				if (err) { console.log(err); } 
				next();
			});
		} else { next(); }
	});

	// VIEWS
	app.get('/', function(req, res) {
		get_routes_all(function (err, rows) {
			if (err) {
				res.status(500).send(err);
			} else {
				var routes = {};
				var route_id_list = [];
				rows.forEach(function (route) {
					var boro = route.route_id.replace(/[0-9]/g, '');

					if (boro.indexOf("BX") > -1) boro = "Bronx";
					else if (boro.indexOf("M") > -1) boro = "Manhattan";
					else if (boro.indexOf("Q") > -1) boro = "Queens";
					else if (boro.indexOf("S") > -1) boro = "Staten Island";
					else if (boro.indexOf("B") > -1) boro = "Brooklyn";
					
					if (routes[boro] == undefined) routes[boro] = [];
					routes[boro].push(route);
					route_id_list.push(route.route_id);
				});

				Object.keys(routes).forEach(function (route) {
					routes[route] = routes[route].sort(function (a, b) {
						a = Number(a.route_id.replace(/\D/g,''));
						b = Number(b.route_id.replace(/\D/g,''));
						if (a > b) return 1;
						if (a < b) return -1;
						else return 0;
					});
				});

				var start_yr = (new Date().getFullYear().toString() - 1).toString() + "-01-01"; //<<<<<MODIFIED FOR 2015!!!
				var end_yr = (new Date()).toISOString().slice(0,10);
				get_excess_waits_all(start_yr, end_yr, function (err, rows) {
					if (err) {
						res.status(500).send(err);
					} else {
						rows.sort(function (a, b) {
							a = Number(a.excess);
							b = Number(b.excess);
							if (a > b) return 1;
							if (a < b) return -1;
							else return 0;
						});
						rows = rows.filter(function (r) {
							return (route_id_list.indexOf(r.route_id) > -1);
						});
						res.render('index', {routes: routes, excess: rows});
					}
				});
			}
		});
	});

	app.get("/range_performance", function (req, res) {
		res.status(200).render("range_performance");
	});

	app.get("/about", function (req, res) {
		res.status(200).render("about");
	});

	app.get("/routes/:route_id", function (req, res) {
		var route_id = req.params.route_id;
		var return_obj;

		get_specific_route(route_id, function (err, row) {
			if (err) {
				res.status(500).send(err);
			} else {
				return_obj = row;

				get_stops_by_route_direction(0, route_id, function (err, rows) {
					if (err) {
						res.status(500).send(err);

					} else {
						return_obj["stops"] = [rows];

						get_stops_by_route_direction(1, route_id, function (err, rows) {
							if (err) {
								res.status(500).send(err);
							} else {
								return_obj["stops"].push(rows);

								var start_yr = (new Date().getFullYear().toString() - 1).toString() + "-01-01"; //<<<<<MODIFIED FOR 2015!!!
								var end_yr = (new Date()).toISOString().slice(0,10);
								get_headway_comparison(route_id, start_yr, end_yr, function (err, row) {
									if (err) {
										res.status(500).send(err);
									} else {
										return_obj["headways"] = row;

										get_timeliness_distribution(route_id, function (err, row) {
											if (err) {
												res.status(500).send(err);
											} else {
												return_obj["timeliness_distribution"] = row;

												res.status(200).render("routes", {route: return_obj});
											}
										});
									}
								});
							}
						});
					}
				});
			}
		});
	});

	app.get("/routes/:route_id/stops/:direction_id/:stop_id/:yyyymmdd?", function(req, res) {
		var route_id = req.params.route_id;
		var direction_id = req.params.direction_id;
		var stop_id = req.params.stop_id;

		var yyyymmdd = req.params.yyyymmdd;
		if (yyyymmdd == undefined) {
			yyyymmdd = (new Date()).toISOString().slice(0,10);
		} else {
			yyyymmdd = yyyymmdd.slice(0, 4) + "-" + yyyymmdd.slice(4, 6) + "-" +yyyymmdd.slice(6, 8);
		}


		get_specific_route(route_id, function (err, row) {
			if (err) {
				res.status(500).send(err);
			} else {
				return_obj = row;
				return_obj["curr_direction"] = return_obj["directions"][direction_id];

				get_stop_by_route_direction(stop_id, direction_id, route_id, function (err, row) {
					if (err) {
						res.status(500).send(err);
					} else {
						return_obj["stop"] = row;
						return_obj["stop"]["dir"] = direction_id;

						get_stop_data_by_day(yyyymmdd, stop_id, direction_id, route_id, function (err, rows) {
							if (err) {
								res.status(500).send(err);
							} else {
								var table_st = {};
								for (var h = 0; h < 24; h++) { table_st[h] = []; }

								rows["stop_times"].forEach(function (stop_times) {
									if (stop_times['pickup_type'] !== 1) {
										table_st[parseInt(stop_times['arrival_time'].substring(0, 2))].push([stop_times['departure_time'].substring(3, 5), 'D']);
									} else {
										table_st[parseInt(stop_times['arrival_time'].substring(0, 2))].push([stop_times['arrival_time'].substring(3, 5), 'A']);
									}
								});

								var table_at = {};
								for (var h = 0; h < 24; h++) { table_at[h] = []; }

								rows["actual_times"].forEach(function (actual_times) {
									if (actual_times['departure_time'] != null) {
										table_at[parseInt(actual_times['departure_time'].substring(0, 2))].push([actual_times['departure_time'], actual_times['deviation'], actual_times['vehicle_id'], actual_times['source'], 'D']);
									} else {
										table_at[parseInt(actual_times['arrival_time'].substring(0, 2))].push([actual_times['arrival_time'], actual_times['deviation'], actual_times['vehicle_id'], actual_times['source'], 'A']);
									}
								});

								return_obj["stop_times"] = table_st;
								return_obj["actual_times"] = table_at;
								res.status(200).render("route_stop", {route: return_obj});
							}
						});
					}
				});
			}
		});
	});

	app.get("/developer", function(req, res) {
		res.status(200).render("developer_login");
	});

	// Account management
	app.post("/developer/create", function(req, res) {
		var em = String(req.body.email);
		var pw = String(req.body.password);
		var org = String(req.body.org);

		var usecase = String(req.body.usecase);
		var moreinfo = String(req.body.moreinfo);

		var tk = uuid.v4();
		var q1 = "SELECT * FROM users WHERE email = '" + em + "';";

		usersDB.get(q1, function (err, row) {
			if (err) {
				res.status(500).send(err);
			} else {
				if (row) { res.status(200).send({is_dupe: true, token: null}); } 
				else {
					var q2 = "INSERT INTO users VALUES ('" + em + "', '" + pw + "', '" + tk + "', '" + org + "', '" + Date.now() + "');";
					usersDB.run(q2, function (err, row) {
						if (err) {
							res.status(500).send(err);
						} else {
							res.status(200).send({is_dupe: false, token: tk});
						}
					});
				}
			}
		});

		
			console.log("sending a text t0 " + em);
			var text = "This user, " + em + ", from " + org + ", is interested in using the Bus Data API tool for the following reason: " + usecase;
			if (moreinfo == "true") { text = text + " \n \n The user is also interested in hearing more information on the campaign to improve local bus service in NYC." }
			emailUserPW(text, "kuanbutts@gmail.com", function () {} );
	});

	app.post("/developer/new_token", function(req, res) {
		var em = String(req.body.email);
		var pw = String(req.body.password);
		var tk = String(req.body.token);
		var new_tk = uuid.v4();
		var q = "UPDATE users SET token = '" + new_tk + "' WHERE email = '" + em + "' AND xp = '" + pw + "';";
		usersDB.run(q, function (err, row) {
			if (err) {
				res.status(500).send(err);
			} else {
				res.status(200).send(new_tk)
			}
		});
	});

	app.get("/developer/email_pw/:email", function(req, res) {
		var em = String(req.params.email);
		var query = "SELECT * FROM users WHERE email = '" + em + "';";
		usersDB.get(query, function (err, row) {
			if (err) {
				res.status(500).send(err);
			} else {
				if (row) {
					var text = "Your password for the Bus Data API account with email " + row.email + " is: " + row.password;
					var time = new Date(Date.now()).toUTCString(),
						introPhrase = '<b>[Password Request] </b> Your password was requested at ' + time + ': <br>';
					text = [introPhrase, text].join(' ');
					emailUserPW(text, row.email, function () { res.status(200).send({email: row.email}); });
				} else {
					res.status(200).send({email: null});
				}
			}
		});
	});

	app.delete("/developer/account/:email/:password", function(req, res) {
		var em = String(req.params.email);
		var pw = String(req.params.password);
		var query = "DELETE from users WHERE email = '" + em + "' AND xp = '" + pw + "';";
		console.log(query);
		usersDB.run(query, function (err, row) {
			if (err) {
				res.status(500).send(err);
			} else {
				res.status(200).send()
			}
		});
	});

	app.get("/developer/account/:email/:password", function (req, res) {
		var em = String(req.params.email);
		var pw = String(req.params.password);
		var query = "SELECT * FROM users WHERE email = '" + em + "' and xp = '" + pw + "';";
		usersDB.get(query, function (err, row) {
			if (err) {
				res.status(500).send(err);
			} else {
				row.password = Array(row.xp.length + 1).join("*");
				delete row.xp;
				res.status(200).send(row)
			}
		});
	});

	app.get("/use/api", function (req, res) {
		var query = "SELECT * FROM activity WHERE api='1' ORDER BY date DESC;";
		usersDB.all(query, function (err, rows) {
			if (err) { res.status(500).send(err); } 
			else { 
				var html = "<html><body><ul>";
				try { 
					rows.forEach(function (ea) { 
						ea.date = Number(ea.date);
						html = html + "<li> User " + ea.who + ": " + ea.path + " on " + new Date(ea.date).toISOString().split("T")[0] + "</li>"; 
					});
				} catch (e) { console.log(e); }
				html += "</ul></body>";
				res.status(200).send(html); 
			}
		});
	});

	app.get("/use/public", function (req, res) {
		var query = "SELECT * FROM activity WHERE api='0' ORDER BY date DESC;";
		usersDB.all(query, function (err, rows) {
			if (err) { res.status(500).send(err); } 
			else { 
				var html = "<html><body><ul>";
				try { 
					rows.forEach(function (ea) { 
						ea.date = Number(ea.date);
						html = html + "<li> User " + ea.who + ": " + ea.path + " on " + new Date(ea.date).toISOString().split("T")[0] + "</li>"; 
					});
				} catch (e) { console.log(e); }
				html += "</ul></body>";
				res.status(200).send(html); 
			}
		});
	});

	app.get("/use/all", function (req, res) {
		var query = "SELECT * FROM activity ORDER BY date DESC;";
		usersDB.all(query, function (err, rows) {
			if (err) { res.status(500).send(err); } 
			else { 
				var html = "<html><body><ul>";
				try { 
					rows.forEach(function (ea) { 
						ea.date = Number(ea.date);
						html = html + "<li> User " + ea.who + ": " + ea.path + " on " + new Date(ea.date).toISOString().split("T")[0] + "</li>"; 
					});
				} catch (e) { console.log(e); }
				html += "</ul></body>";
				res.status(200).send(html); 
			}
		});
	});


	// API ROUTES
	var router = express.Router(); 

	// middleware for all api requests, check for token
	router.use(function (req, res, next) {
		var token, inHeader = false, asToken = false;
		if (req.hasOwnProperty("headers") && req.headers.hasOwnProperty("token")) {
			inHeader = true;
			token = req.headers.token;
		} else if (req.hasOwnProperty("query") && req.query.hasOwnProperty("token")) {
			asToken = true;
			token = req.query.token;
		}
		if (inHeader || asToken) {
			var q1 = "SELECT rowid, * FROM users WHERE token = '" + token + "';";
			usersDB.get(q1, function (err, row) {
				if (err) {
					res.status(500).send(err);
				} else {
					if (row) {

						var path = req.url, who = row.rowid, api = 1;
						try { path = path.split("?")[0] } catch (e) {}
						var qLog = "INSERT INTO activity VALUES ('" + who + "', '" + api + "', '" + path + "', '" + Date.now() + "');";
						usersDB.run(qLog, function (err, row) {
							if (err) { res.status(500).send(err); } 
							else {
								var q2 = "UPDATE users SET last_req = '" + Date.now() + "' WHERE token = '" + token + "';"
								usersDB.run(q2, function (err, row) {
									if (err) { res.status(500).send(err); } 
									else { next(); }
								});
							}
						});

					} else {
						res.status(404).send("Token not found.");
					}
				}
			});
		} else {
			res.status(401).send("No token supplied.");
		}
	});


	router.route("/routes")

		.get(function (req, res) {
			get_routes_all(function (err, rows) {
				if (err) {
					res.status(404).send(err);
				} else {
					res.status(200).send(rows);
				}
			});
		});


	router.route("/routes/:route_id")

		.get(function (req, res) {
			var route_id = req.params.route_id;

			get_specific_route(route_id, function (err, rows) {
				if (err) {
					res.status(500).send(err);
				} else {
					res.status(200).send(rows);
				}
			});
		});


	router.route("/routes/:route_id/stops")

		.get(function (req, res) {
			var route_id = req.params.route_id;
			var return_obj;

			get_stops_by_route_direction(0, route_id, function (err, rows) {
				if (err) {
					res.status(500).send(err);

				} else {
					return_obj = [rows];

					get_stops_by_route_direction(1, route_id, function (err, rows) {
						if (err) {
							res.status(500).send(err);
						} else {
							return_obj.push(rows);
							res.status(200).send(return_obj);
						}
					});
				}
			});
		});


	router.route("/routes/:route_id/stops/:direction_id")

		.get(function (req, res) {
			var route_id = req.params.route_id;
			var direction_id = req.params.direction_id;

			get_stops_by_route_direction(direction_id, route_id, function (err, rows) {
				if (err) {
					res.status(500).send(err);
				} else {
					res.status(200).send(rows);
				}
			});
		});


	router.route("/routes/:route_id/stops/:direction_id/:stop_id")

		.get(function (req, res) {
			var route_id = req.params.route_id;
			var direction_id = req.params.direction_id;
			var stop_id = req.params.stop_id;
			var yyyymmdd = (new Date()).toISOString().slice(0,10);

			get_stop_data_by_day(yyyymmdd, stop_id, direction_id, route_id, function (err, rows) {
				if (err) {
					res.status(500).send(err);
				} else {
					res.status(200).send(rows);
				}
			});
		});


	router.route("/routes/:route_id/stops/:direction_id/:stop_id/date/:date")

		.get(function (req, res) {
			var route_id = req.params.route_id;
			var direction_id = req.params.direction_id;
			var stop_id = req.params.stop_id;
			var yyyymmdd = yyyymmdd.slice(0, 4) + "-" + yyyymmdd.slice(4, 6) + "-" +yyyymmdd.slice(6, 8);

			get_stop_data_by_day(yyyymmdd, stop_id, direction_id, route_id, function (err, rows) {
				if (err) {
					res.status(500).send(err);
				} else {
					res.status(200).send(rows);
				}
			});
		});


	// prefixed all restful routes with /api
	app.use("/api", router);
	// END ROUTES


	// QUERY UTILITIES

	function base_routes_metadata_query (anchor_date, route_id) {
		if (typeof anchor_date == 'undefined' || !anchor_date) anchor_date = (new Date()).toISOString().slice(0,10);
		var q = "SELECT route_id, agency_id, route_short_name, route_long_name, route_desc, route_url, route_color, route_text_color " + 
						"FROM routes INNER JOIN agency ON routes.agency_index = agency.agency_index " +
						"WHERE agency.feed_index IN (SELECT feeds.feed_index FROM feeds " + 
							"WHERE feeds.feed_start_date <= '" + anchor_date + "' " + 
							"AND feeds.feed_end_date >= '" + anchor_date + "') ";
		if (typeof route_id == 'string') q = q + " AND route_id = '" + route_id + "' ";
		return q;
	};

	function get_routes_all (cb) {
		var q = base_routes_metadata_query() + "GROUP BY route_id;";
		handle_database(q, cb);
	};

	function get_specific_route (route_id, cb) {
		var q = base_routes_metadata_query() + "GROUP BY route_id;";
		var q1 =  "SELECT route_id, agency_id, route_short_name, route_long_name, route_desc, route_url, route_color, route_text_color " + 
							"FROM routes_current WHERE route_id = '" + route_id + "' LIMIT 1;";
		handle_database(q1, function (err, rows) {
			if (err) {
				cb(err, null);
			} else {
				if (rows.length > 0) {
					var return_obj = rows[0];
					var q2 = "SELECT direction_id, direction_name FROM directions WHERE route_id = '" + route_id + "' LIMIT 2;";
					handle_database(q2, function (err, rows) {
						if (err) {
							cb(err, null);
						} else {
							return_obj["directions"] = rows.map(function (direction) { return direction.direction_name; });
							cb(err, return_obj);
						}
					});
				} else {
					cb({"error": "No route for that id."}, null);
				}
			}
		});
	};

	function get_stops_by_route_direction (direction_id, route_id, cb) {
		var q =  "SELECT s.stop_id, s.stop_name, '' AS stop_desc, stop_lat, stop_lon " +
							"FROM stops_current s, rds WHERE direction_id = " + direction_id + " AND rds.stop_id = s.stop_id " +
							"AND route_id = '" + route_id + "';";
		handle_database(q, function (err, rows) { cb(err, rows); });
	};

	function get_stop_by_route_direction (stop_id, direction_id, route_id, cb) {
		var q =  "SELECT s.stop_id, s.stop_name, '' AS stop_desc, stop_lat, stop_lon " +
							"FROM stops_current s, rds WHERE direction_id = " + direction_id + " AND rds.stop_id = s.stop_id " +
							"AND route_id = '" + route_id + "' AND s.stop_id = '" + stop_id + "' LIMIT 1;";
		handle_database(q, function (err, rows) { cb(err, rows[0]); });
	};

	function get_stop_data_by_day (yyyymmdd, stop_id, direction_id, route_id, cb) {
		var response_obj = {};
		var q1 = "SELECT trip_id, trip_headsign, dep AS arrival_time, dep AS departure_time, stop_sequence, pickup_type, drop_off_type " +
						"FROM (" + 
							"SELECT IF(date_offset < 1, departure_time, SUBTIME(departure_time, '24:00:00')) " +
								"AS dep, date_offset, trip_id, trip_headsign, stop_sequence, pickup_type, drop_off_type " +
							"FROM date_trips dt, stop_times st, trips t " +
								"WHERE date = '" + yyyymmdd + "' AND dt.route_id = '" + route_id + "' " + 
									"AND dt.direction_id = '" + direction_id + "' AND st.stop_id = '" + stop_id + "'" +
									"AND dt.trip_index = st.trip_index AND st.trip_index = t.trip_index" +
						") AS x WHERE dep BETWEEN '-00:00:30' AND '23:59:29' ORDER BY dep;";
		handle_database(q1, function (err, rows) { 
			if (err) {
				cb(err, null); 
			} else {
				response_obj["stop_times"] = rows;

				var q2 = "SELECT TIME(IF(dwell_time = -2, NULL, IF(dwell_time = -1, call_time, DATE_SUB(call_time, INTERVAL dwell_time SECOND)))) est_arr, " + 
										"IF(dwell_time = -1, NULL, TIME(call_time)) est_dep, " + 
								        "deviation, " +
								        "vehicle_id, " +
								        "CASE source WHEN 'S' THEN 'X' WHEN 'E' THEN 'X' ELSE source END AS source " +
											"FROM calls WHERE rds = (SELECT rds FROM rds WHERE route_id = '" + route_id + "' AND direction_id = " + direction_id + " AND stop_id = " + stop_id + " LIMIT 1) " + 
								            "AND call_time BETWEEN '" + yyyymmdd + " 00:00:00' AND '" + yyyymmdd + " 23:59:59';"
				handle_database(q2, function (err, rows) {
					if (err) {
						cb(err, null);
					} else {
						response_obj["actual_times"] = rows.map(function (r) {
							return {
								"arrival_time": r.est_arr,
								"departure_time": r.est_dep,
								"deviation": parseInt(r.deviation),
								"vehicle_id": r.vehicle_id,
								"source": r.source
							}
						});
						cb(err, response_obj);
					}
				});
			}
		});
	};

	function get_headway_comparison (route_id, start_date, end_date, cb) {
		var has_start = (start_date !== undefined && start_date !== "" && start_date !== null && start_date);
		var has_end = (end_date !== undefined && end_date !== "" && end_date !== null && end_date);
		var timeframe_clause = " AND date BETWEEN '" + start_date + "' AND '" + end_date + "';";

		var q = "SELECT TRUNCATE(SUM(sh_sq)/SUM(sh)/120, 1) as sched_hw, " + 
							"TRUNCATE(SUM(ah_sq)/SUM(ah)/120, 1) as actual_hw, " +
		      		"TRUNCATE((SUM(ah_sq)/SUM(ah)/120) - (SUM(sh_sq)/SUM(sh)/120), 1) as excess_hw, " +
		      		"TRUNCATE(100*((SUM(ah_sq)/SUM(ah)/120) - (SUM(sh_sq)/SUM(sh)/120))/(SUM(sh_sq)/SUM(sh)/120), 1) as excess_pct " + 
						"FROM sum_ewt_hf WHERE route_id = '" + route_id + "'";
		if (has_start && has_end) { q = q + timeframe_clause; } 
		else { q = q + ";"; }

		handle_database(q, function (err, rows) { cb(err, rows[0]); });
	};

	function get_timeliness_distribution (route_id, cb) {
		var q = "SELECT TRUNCATE(SUM(early)/SUM(early + on_time + late)*100, 1) as early, " +
								"TRUNCATE(SUM(on_time)/SUM(early + on_time + late)*100, 1) as on_time, " +
        				"TRUNCATE(SUM(late)/SUM(early + on_time + late)*100, 1) as late " +
						"FROM sum_otp_lf WHERE route_id = '" + route_id + "';";

		handle_database(q, function (err, rows) { cb(err, rows[0]); });
	};

	function get_excess_waits_all (start_date, end_date, cb) {
		var q = "SELECT route_id, TRUNCATE((SUM(ah_sq)/SUM(ah)/120) - (SUM(sh_sq)/SUM(sh)/120), 1) as excess, " + 
							"TRUNCATE(100*((SUM(ah_sq)/SUM(ah)/120) - (SUM(sh_sq)/SUM(sh)/120))/(SUM(sh_sq)/SUM(sh)/120), 1) as excess_pct, " + 
							"SUM(sched_pickups) as sched_pickups " + 
						"FROM sum_ewt_hf " + 
						"WHERE date BETWEEN '" + start_date + "' AND '" + end_date + "' " + 
						"GROUP BY route_id;";
		handle_database(q, function (err, rows) { cb(err, rows); });
	};


	// start server
	function startServer () {
		app.listen(port);
		console.log("bus-data-api now running on port " + port);	
	};
};


// onload logic
// application run directly; start app server
if (require.main === module) super_ops();

// application imported as a module via "require"
// export function to create server
else module.exports = super_ops;











