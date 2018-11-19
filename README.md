# MailAPI
To start API server run node server.js
Expects valid GMAIL credentials in credentials.json file
On first run asks for code from authUrl for gmail information. Will write token to disk in token.json and re-use token as long as it is available. For security you should delete old tokens that you don't want used and deactivate them through gmail.
Every hour, server calls Gmail API to determine # of emails sent to gmail vs non-gmail users and # of emails recieved to user from gmail vs non-gmail users. Values are persisted in DynamoDb instance.
DynamoDb instance expects credentials to be /user/USER_NAME/.aws/credentials. Node library will use this path by default to connect to DynamoDb instance. DynamoDb instance expects to have an EmailStats table with Partition Key StatsDay and Sort Key StatsHour.

Only route exposed to API is GET /api/email/stats.
Expects query string with possible arguments:
Name       Type         Format          Description                                         Required
day       String       YYYY-MM-dd    Date to fetch hourly data from                           YES
hour      Number       Between 0-23  Specific hour to fetch data for with a give day          NO