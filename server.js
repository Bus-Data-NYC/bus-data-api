var express = require("express");
var app = express();


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





function handle_database (query, cb) {
	pool.getConnection(function (err, connection) {
		if (err) {
			connection.release();
			cb({"code" : 100, "status" : "Error in connection database"});
		}
		console.log("connected as id " + connection.threadId);
		connection.query(query, function (err, rows) {
			connection.release();
			cb(err, rows);
		});
		connection.on("error", function (err) {      
			cb({"code" : 100, "status" : "Error in connection database"});
		});
	});
}




var port = process.env.PORT || 8080; 


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

		var query = "SELECT route_id, agency_id, route_short_name, route_long_name, route_desc, route_url, route_color, route_text_color " + 
								"FROM routes_current WHERE route_short_name = '" + route_id + "' LIMIT 1;";

		handle_database(query, function (err, rows) {
			// connection.end();
			if (err) {
				res.status(404).send(err);
			} else {
				res.status(200).send(rows);
			}
		});
	});


// prefixed all restful routes with /api
app.use("/api", router);
// END ROUTES


// start server
function startServer () {
	app.listen(port);
	console.log("bus-data-api now running on port " + port);	
};

