# bus-data-api

The purpose of this tool is to create a simple API wrapper over the database created from this projects web scraping and bus performance analytics that are calculated based off of the scraped "real-time" MTA One Bus Away Bustime API data feed.


### Example credentials.json

An 	`credentials.json` file needs to be created locally in the root directory in order for this Node API server to run correctly. This is what it should look like:

```
{
  "host":     "www.example.com",
  "database": "db_name",
  "username": "avg_joe",
  "password": "foobar_pw",
  "s_token":  "abcd1234EFGH"
}
```

This will allow access to the database that will be queried upon API calls.


### To-do (coming soon)

Our goal for this repo is to create a wiki as well that will allow individuals to see how the API is structured and reference it for utilizing the API we deploy.