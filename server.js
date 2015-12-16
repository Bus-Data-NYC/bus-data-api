function super_ops () {
	var express = require("express");
	var app = express();

	// set the view engine to ejs
	app.set('view engine', 'ejs');
	app.use(express.static(__dirname + './views'));
	app.use(express.static(__dirname + './bower_components'));

	var port = process.env.PORT || 8080; 


	// this will let us get the data from a POST
	var bodyParser = require("body-parser");
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({ extended: true }));

	// bcrypt setup
	var bcrypt = require('bcryptjs');
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
			if (err) {
				console.log("Connection to MySQL server failed.");
			} else {

				// now attach to local sqlite3 user accounts
				sqlite3 = require('sqlite3').verbose();
				usersDB = new sqlite3.Database('database/users.db');
				usersDB.run("CREATE TABLE if not exists users (email TEXT, password TEXT, token TEXT, last_req TEXT)");

				startServer();
			}
		});
	});


	// pool manager for mysql connections
	function handle_database (query, cb) {console.log(query);
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


	// VIEWS
	app.get('/', function(req, res) {
		get_routes_all(function (err, rows) {
			if (err) {
				res.status(404).send(err);
			} else {
				var routes = {};
				rows.forEach(function (route) {
					var boro = route.route_id.replace(/[0-9]/g, '');

					if (boro.indexOf("BX") > -1) boro = "Bronx";
					else if (boro.indexOf("M") > -1) boro = "Manhattan";
					else if (boro.indexOf("Q") > -1) boro = "Queens";
					else if (boro.indexOf("S") > -1) boro = "Staten Island";
					else if (boro.indexOf("B") > -1) boro = "Brooklyn";
					
					if (routes[boro] == undefined) routes[boro] = [];
					routes[boro].push(route);
				});
				res.render('index', {routes: routes});
			}
		});
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
								res.status(200).render("routes", {route: return_obj});
							}
						});
					}
				});
			}
		});
	});

	app.get("/routes/:route_id/:direction_id/:stop_id", function(req, res) {
		var route_id = req.params.route_id;
		var direction_id = req.params.direction_id;
		var stop_id = req.params.stop_id;
		var yyyymmdd = (new Date()).toISOString().slice(0,10).replace(/-/g,"");

		get_specific_route(route_id, function (err, row) {
			if (err) {
				res.status(500).send(err);
			} else {
				return_obj = row;

				get_stop_data_by_day(yyyymmdd, stop_id, direction_id, route_id, function (err, rows) {
					if (err) {
						res.status(500).send(err);
					} else {
						var table = {};
						for (var h = 0; h < 24; h++) { table[h] = []; }

						rows.forEach(function (stop_times) {
							if (stop_times['pickup_type'] !== 1) {
								table[parseInt(stop_times['departure_time'].substring(0, 2))].push([stop_times['departure_time'].substring(3, 5), 'D']);
							} else {
								table[parseInt(stop_times['arrival_time'].substring(0, 2))].push([stop_times['arrival_time'].substring(3, 5), 'A']);
							}
						});

						return_obj["stop_times"] = table;
						res.status(200).render("route_stop", {route: return_obj});
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
		var tk = uuid.v4();
		var q1 = "SELECT * FROM users WHERE email = '" + em + "';";
		usersDB.get(q1, function (err, row) {
			if (err) {
				res.status(500).send(err);
			} else {
				if (row) {
					res.status(200).send({is_dupe: true, token: null});
				} else {
					var q2 = "INSERT INTO users VALUES ('" + em + "', '" + pw + "', '" + tk + "', '" + Date.now() + "');";
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
	});

	app.post("/developer/new_token", function(req, res) {
		var em = String(req.body.email);
		var pw = String(req.body.password);
		var tk = String(req.body.token);
		var new_tk = uuid.v4();
		var q = "UPDATE users SET token = '" + new_tk + "' WHERE email = '" + em + "' AND password = '" + pw + "';";
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
					emailUserPW(text, row.email, function () {
						res.status(200).send({email: row.email});
					});
				} else {
					res.status(200).send({email: null});
				}
			}
		});
	});

	app.delete("/developer/account/:email/:password", function(req, res) {
		var em = String(req.params.email);
		var pw = String(req.params.password);
		var query = "DELETE from users WHERE email = '" + em + "' AND password = '" + pw + "';";
		usersDB.run(query, function (err, row) {
			if (err) {
				res.status(500).send(err);
			} else {
				res.status(200).send()
			}
		});
	});

	app.get("/developer/account/:email/:password", function(req, res) {
		var em = String(req.params.email);
		var pw = String(req.params.password);
		var query = "SELECT * FROM users WHERE email = '" + em + "' and password = '" + pw + "';";
		usersDB.get(query, function (err, row) {
			if (err) {
				res.status(500).send(err);
			} else {
				res.status(200).send(row)
			}
		});
	});


	// API ROUTES
	var router = express.Router(); 

	// middleware for all api requests, check for token
	router.use(function(req, res, next) {
		var token, inHeader = false, asToken = false;
		if (req.hasOwnProperty("headers") && req.headers.hasOwnProperty("token")) {
			inHeader = true;
			token = req.headers.token;
		} else if (req.hasOwnProperty("query") && req.query.hasOwnProperty("token")) {
			asToken = true;
			token = req.query.token;
		}
		if (inHeader || asToken) {
			var q1 = "SELECT * FROM users WHERE token = '" + token + "';";
			usersDB.get(q1, function (err, row) {
				if (err) {
					res.status(500).send(err);
				} else {
					if (row) {
						var q2 = "UPDATE users SET last_req = '" + Date.now() + "' WHERE token = '" + token + "';"
						usersDB.run(q2, function (err, row) {
							if (err) {
								res.status(500).send(err);
							} else {
								next();
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
			var return_obj;

			get_specific_route(route_id, function (err, rows) {
				if (err) {
					res.status(500).send(err);
				} else {
					res.status(200).send(return_obj);
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
			var yyyymmdd = (new Date()).toISOString().slice(0,10).replace(/-/g,"");

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
			var yyyymmdd = req.params.date;

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

	function get_routes_all (cb) {
		var q = "SELECT route_id, agency_id, route_short_name, route_long_name, route_desc, route_url, route_color, route_text_color " + 
						"FROM routes_current ORDER BY LEFT(route_id, 1), SUBSTR(route_id, 2, 99) + 0, route_id";
		handle_database(q, cb);
	};

	function get_specific_route (route_id, cb) {
		var q1 =  "SELECT route_id, agency_id, route_short_name, route_long_name, route_desc, route_url, route_color, route_text_color " + 
							"FROM routes_current WHERE route_short_name = '" + route_id + "' LIMIT 1;";
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

	function get_stop_data_by_day (yyyymmdd, stop_id, direction_id, route_id, cb) {
		var q = "SELECT trip_id, trip_headsign, dep AS arrival_time, dep AS departure_time, stop_sequence, pickup_type, drop_off_type " +
						"FROM (" + 
							"SELECT IF(date_offset < 1, departure_time, SUBTIME(departure_time, '24:00:00')) " +
								"AS dep, date_offset, trip_id, trip_headsign, stop_sequence, pickup_type, drop_off_type " +
							"FROM date_trips dt, stop_times st, trips t " +
								"WHERE date = '" + yyyymmdd + "' AND dt.route_id = '" + route_id + "' " + 
									"AND dt.direction_id = '" + direction_id + "' AND st.stop_id = '" + stop_id + "'" +
									"AND dt.trip_index = st.trip_index AND st.trip_index = t.trip_index" +
						") AS x WHERE dep BETWEEN '-00:00:30' AND '23:59:29' ORDER BY dep;";
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











