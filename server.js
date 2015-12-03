var express = require("express");
var app = express();

// this will let us get the data from a POST
var bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var port = process.env.PORT || 8080; 


// API ROUTES
var router = express.Router(); 

// middleware for all api requests, check for token
router.use(function(req, res, next) {
	console.log(req.headers.key);
	if (req.hasOwnProperty("headers") && req.headers.hasOwnProperty("key")) {
		if (req.headers.key == "foobar") next();
		else res.status(401).send("Key not found.");
	} else {
		res.status(401).send("No key supplied.");
	}
    
});

router.get('/', function(req, res) {
	res.json({ message: 'hooray! welcome to our api!' });   
});

// prefixed all restful routes with /api
app.use('/api', router);
// END ROUTES


// start server
app.listen(port);
console.log('bus-data-api now running on port ' + port);