var express = require("express");
var app = express();


// this will let us get the data from a POST
var bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


// attach to MySQL db
var fs = require('fs');
var credentials, mysql, connection;
fs.readFile('credentials.json', 'utf8', function (err, data) {
  if (err) throw err;
  credentials = JSON.parse(data);
	mysql = require('mysql');
	connection = mysql.createConnection({
	  host: credentials.host,
	  user: credentials.user,
	  password: credentials.password,
	  database: credentials.database
	});

	connection.connect(function (err) {
	if (err) {
		throw err;
	} else {
	  startServer();
	}
	});
});


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

router.route('/routes/:route_id')	
	.get(function (req, res) {
		var route_id = req.params.route_id;

		var query = "";

// SELECT agency_id, route_short_name, route_long_name, route_desc, route_url, route_color, route_text_color 
// 	FROM routes 

// INNER JOIN agency 
// 	ON routes.agency_index = agency.agency_index 

// WHERE routes.feed_index = (
// 	SELECT MAX(feed_index) FROM routes 

// 	WHERE feed_index >= (
// 		SELECT MIN(feed_index) FROM feeds 
// 		WHERE feed_start_date <= "2015-12-03" 
// 			AND feed_end_date >= "2015-12-03"
// 	)
//     AND route_id = "BX1"
// )

// AND routes.route_id = "BX1";


		connect.query()

		res.status(200).send(route_id);
	});


// prefixed all restful routes with /api
app.use('/api', router);
// END ROUTES


// start server
function startServer () {
	app.listen(port);
	console.log('bus-data-api now running on port ' + port);	
};

