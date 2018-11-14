const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = 'token.json';

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
    if (err) 
      return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Gmail API.
    authorize(JSON.parse(content), getMessages);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) 
      return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) 
        return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) 
          return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Get's messages for this users account
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function getMessages(auth) {
  const gmail = google.gmail({version: 'v1', auth});
  var dailyMessageIds = [];
  var nextPageToken = '';
  do {
    nextPageToken = await getNextPageOfMessages(gmail, nextPageToken, dailyMessageIds);
  } while (nextPageToken);
  var mailInfo = await getAllMessageInfo(gmail, dailyMessageIds);
  console.log(mailInfo);
}

function getNextPageOfMessages(gmail, token, dailyMessageIds) {
  return new Promise(function(resolve, reject) {
    gmail.users.messages.list({
      userId: 'me',
      q: 'newer_than:1d',
      pageToken: token,
    }, (err, res) => {
      if (err) 
        return console.log('The API returned an error: ' + err);
      const messages = res.data.messages;
      token = res.data.nextPageToken;
      if (messages.length) {
        messages.forEach((message) => {
          dailyMessageIds.push(`${message.id}`);
        });
      } else {
        token = null;
        console.log('No messages found.');
      }
      resolve(token);
    });
  });
}

async function getAllMessageInfo(gmail, dailyMessageIds) {
  return new Promise(function(resolve, reject) {
    var fromGmail = 0;
    var toGmail = 0;
    var fromOther = 0;
    var toOther = 0;
    var allPromises = [];
    for (let i = 0; i < dailyMessageIds.length; i++) {
      allPromises.push(getMessageHeaderInfo(gmail, dailyMessageIds[i]));
    }
    resolve(Promise.all(allPromises));
  });
}

function getMessageHeaderInfo(gmail, messageId) {
  return new Promise(function(resolve, reject) {
    gmail.users.messages.get({
      userId: 'me',
      id: messageId,
    }, (err, res) => {
      if (err) 
        return console.log('The API returned an error: ' + err);
      const headers = res.data.payload.headers;
      if (headers.length) {
        headers.forEach((header) => {
          if (`${header.name}` == 'From' && !`${header.value}`.includes("kuriakose.arun@gmail.com")) {
            resolve(`FROM ${header.value}`);
          }
          else if (`${header.name}` == 'To' && !`${header.value}`.includes("kuriakose.arun@gmail.com")) {
            resolve(`TO ${header.value}`);
          }
        });
      }
    });
  });
}