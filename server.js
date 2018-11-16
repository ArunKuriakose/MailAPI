const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = 'token.json';

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
 * Retrieve all messages for last day from Gmail API, get metadata and return email counts (Recieved, )
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function getMessages(auth) {
  console.log("Getting messages");
  const gmail = google.gmail({version: 'v1', auth});
  var dailyMessageIds = [];
  var nextPageToken = '';
  do {
    nextPageToken = await getNextPageOfMessages(gmail, nextPageToken, dailyMessageIds);
  } while (nextPageToken);
  return await getAllMessageInfo(gmail, dailyMessageIds);
}

// Use next page token to get next set of message ids
function getNextPageOfMessages(gmail, token, dailyMessageIds) {
  return new Promise(function(resolve, reject) {
    gmail.users.messages.list({
      userId: 'me',
      q: 'newer_than:1h',
      pageToken: token,
    }, (err, res) => {
      if (err) 
        return console.log('The API returned an error: ' + err);
      const messages = res.data.messages;
      token = res.data.nextPageToken;
      if (messages && messages.length) {
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

// Use message ids retrieved from API to get actual metadata for each message and obtain gmail vs non-gmail sents/recieved stats
async function getAllMessageInfo(gmail, dailyMessageIds) {
  return new Promise(function(resolve, reject) {
    var fromGmail = 0;
    var toGmail = 0;
    var fromOther = 0;
    var toOther = 0;
    var allPromises = [];
    if (dailyMessageIds) {
      for (let i = 0; i < dailyMessageIds.length; i++) {
        allPromises.push(getMessageHeaderInfo(gmail, dailyMessageIds[i]));
      }
      
      Promise.all(allPromises).then((result) => {
        for (let i = 0; i < result.length; i++) {
          if (result[i]) {
            if (result[i].startsWith("FROM")) {
              if (result[i].includes("@gmail.com"))
                fromGmail++;
              else
                fromOther++;
            }
            else {
              if (result[i].includes("@gmail.com"))
                toGmail++;
              else
                toOther++;
            }
          }
        }
        resolve({
          gmailRecv: fromGmail,
          otherRecv: fromOther,
          gmailSent: toGmail,
          otherSent: toOther
        });
      });
    }
    else {
      resolve({
        gmailRecv: fromGmail,
        otherRecv: fromOther,
        gmailSent: toGmail,
        otherSent: toOther
      });
    }
  });
}

// Metadata headers show to and from for email
function getMessageHeaderInfo(gmail, messageId) {
  return new Promise(function(resolve, reject) {
    gmail.users.messages.get({
      userId: 'me',
      id: messageId,
    }, (err, res) => {
      if (err) 
        throw err;
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
      resolve();
    });
  });
}

/**
 * Retrieve all messages for last day from Gmail API, get metadata and email counts, store in DynamoDb
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */

async function addMessageData(auth) {
  var msgData = await getMessages(auth);
  var AWS = require('aws-sdk');
  AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 'default'});
  AWS.config.update({region:'us-east-2'});
  var params = {
    TableName: 'EmailCounts',
    Item: {
      'Date' : new Date().toISOString(),
      'fromGmail' : msgData.gmailRecv,
      'fromOther' : msgData.otherRecv,
      'toGmail' : msgData.gmailSent,
      'toOther' : msgData.otherSent,
    }
  };
  var documentClient = new AWS.DynamoDB.DocumentClient();
  documentClient.put(params, function(err, data) {
    if (err)
      console.log("Error occurred updating message counts", err);
    else
      console.log("Updated table ", data);
  });
}

function startCollecting() {
  // Load client secrets from a local file.
  fs.readFile('credentials.json', (err, content) => {
    if (err) 
      return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Gmail API.
    authorize(JSON.parse(content), addMessageData);
  });
}

var schedule = require('node-schedule');
var j = schedule.scheduleJob('0 0 * * * *', startCollecting);

var express = require('express'), 
    app = express(),
    port = process.env.PORT || 3000;

app.listen(port);

console.log('Gmail RESTful API server started on: ' + port);