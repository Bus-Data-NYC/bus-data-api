# bus-data-api

The purpose of this tool is to create a simple API wrapper over the database created from this projects web scraping and bus performance analytics that are calculated based off of the scraped "real-time" MTA One Bus Away Bustime API data feed.


### Example credentials.json

An 	`credentials.json` file needs to be created locally in the root directory in order for this Node API server to run correctly. This is what it should look like:

```
{
  "host": "example.eastus2.cloudapp.azure.com",
  "database": "exampledatabasename",
  "user": "exampleusername",
  "password": "examplepassword",
  "nodemailer": {
    "service": "Outlook",
    "auth": {
      "user": "exampleemail@email.com",
      "pass": "haveaniceday"
    },
    "options": {
      "from": "Example Foobar <foobar@example.com>"
    }
  }
}
```

This will allow access to the database that will be queried upon API calls.


### To-do (coming soon)

Our goal for this repo is to create a wiki as well that will allow individuals to see how the API is structured and reference it for utilizing the API we deploy.


### Note regarding event emitter warning

After ten requests, Node will log the following:

```
(node) warning: possible EventEmitter memory leak detected. 11 error listeners added. Use emitter.setMaxListeners() to increase limit.
```

Don't worry about this as it's just a warning and has been "dealt" with already. Joyent has some back and forth on it in their Github issues and the warning will not affect performance.