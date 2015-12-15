var nodemailer = require('nodemailer');
var fs = require("fs");

var emailUser = function (credentials, errText, recipient, cb) {
	try {
		var transporter = nodemailer.createTransport({
		  service: credentials.nodemailer.service,
		  auth: {
		    user: credentials.nodemailer.auth.user,
		    pass: credentials.nodemailer.auth.pass
		  }
		});
		var mailOptions = {
	    from: credentials.nodemailer.options.from,
	    to: "",
	    subject: "Sending your password for Bus Data API",
	    text: "",
	    html: ""
		};
		var time = new Date(Date.now()).toUTCString(),
				introPhrase = '<b>[Password Request] </b> Your password was requested at ' + time + ': <br>';
		mailOptions.to = recipient;
		mailOptions.html = mailOptions.text = [introPhrase, errText].join(' ');
		transporter.sendMail(mailOptions, function (error, info) {
		  if (error) console.log(error, info);
		  if (cb !== undefined) cb();
		});
	} catch (e) {
		console.log('Error when trying to run emailUser: ' + e);
	}
};


module.exports = {
	emailUser: emailUser,
};
