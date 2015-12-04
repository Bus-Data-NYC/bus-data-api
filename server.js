var express = require("express");
var app = express();

var port = process.env.PORT || 8080; 


// this will let us get the data from a POST
var bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


// attach to MySQL db and start server
var fs = require("fs");
var credentials, mysql, pool;
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

	startServer();
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


// API ROUTES
var router = express.Router(); 

// middleware for all api requests, check for token
router.use(function(req, res, next) {
	if (req.hasOwnProperty("headers") && req.headers.hasOwnProperty("key")) {
		if (req.headers.key == "foobar") next();
		else res.status(401).send("Key not found.");
	} else {
		res.status(401).send("No key supplied.");
	}
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

							var q3 =  "SELECT s.stop_id, s.stop_name, '' AS stop_desc, stop_lat, stop_lon " +
												"FROM stops_current s, rds WHERE direction_id = 0 AND rds.stop_id = s.stop_id " +
												"AND route_id = '" + route_id + "';";
							handle_database(q3, function (err, rows) {
								if (err) {
									res.status(500).send(err);

								} else {
									return_obj["stops"] = [rows];

									var q4 = q3.replace("direction_id = 0", "direction_id = 1");
									handle_database(q4, function (err, rows) {
										if (err) {
											res.status(500).send(err);
										} else {
											return_obj["stops"].push(rows);
											res.status(200).send(return_obj);
										}
									});
								}
							});
						}
					});
				} else {
					res.status(200).send(return_obj);
				}
			}
		});

		// dump queries
		q1 = q2 = q3 = q4 = null;
	});


// prefixed all restful routes with /api
app.use("/api", router);
// END ROUTES


// start server
function startServer () {
	app.listen(port);
	console.log("bus-data-api now running on port " + port);	
};

