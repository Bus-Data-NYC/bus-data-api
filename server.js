var express = require("express");
var app = express();

// set the view engine to ejs
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/views'));
app.use(express.static(__dirname + '/bower_components'));

var port = process.env.PORT || 8080; 


// this will let us get the data from a POST
var bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// bcrypt setup
var bcrypt = require('bcryptjs');

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
		connection.release();
		if (err) {
			console.log("Connection to MySQL server failed.");
		} else {

			// now attach to local sqlite3 user accounts
			sqlite3 = require('sqlite3').verbose();
			usersDB = new sqlite3.Database('database/users.db');
			usersDB.run("CREATE TABLE if not exists users (email TEXT, password TEXT, token TEXT)");

			startServer();
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

app.get('/developer/account/:email/:pw', function(req, res) {
	var em = req.params.email;
	var pw = req.params.pw;
	var query = "SELECT * FROM users WHERE email = '" + em + "' and password = '" + pw + "';";
	console.log(query);
	usersDB.get(query, function (err, row) {
		if (err) {
			res.status(500).send(err);
		} else if (row == undefined || row == []) {
			res.redirect("/");
		} else {
			res.status(200).send("OK!")
		}
	});
});


// API ROUTES
var router = express.Router(); 

// middleware for all api requests, check for token
router.use(function(req, res, next) {
	var key, inHeader = false, asToken = false;
	if (req.hasOwnProperty("headers") && req.headers.hasOwnProperty("key")) {
		inHeader = true;
		key = req.headers.key;
	} else if (req.hasOwnProperty("query") && req.query.hasOwnProperty("key")) {
		asToken = true;
		key = req.query.key;
	}
	if (inHeader || asToken) {
		if (key == "foobar") next();
		else res.status(401).send("Key not found.");
	} else {
		res.status(401).send("No key supplied.");
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

		var q1 =  "SELECT route_id, agency_id, route_short_name, route_long_name, route_desc, route_url, route_color, route_text_color " + 
							"FROM routes_current WHERE route_short_name = '" + route_id + "' LIMIT 1;";
		handle_database(q1, function (err, rows) {
			if (err) {
				res.status(404).send(err);
			} else {
				return_obj = rows[0];

				if (rows.length > 0) {
					var q2 = "SELECT direction_id, direction_name FROM directions WHERE route_id = '" + route_id + "' LIMIT 2;";
					handle_database(q2, function (err, rows) {
						if (err) {
							res.status(500).send(err);

						} else {
							return_obj["directions"] = rows.map(function (direction) { return direction.direction_name; });
							res.status(200).send(return_obj);
						}
					});
				} else {
					res.status(200).send(return_obj);
				}
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









