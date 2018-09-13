'use strict';

const fs = require('fs');
const request = require('request');
const { JSDOM } = require('jsdom');
const moment = require('moment');

const JOBS = JSON.parse(fs.readFileSync('.data/db/jobs/jobs.json', 'utf8'));
const STOPWORDS = /(?:^|\s+)(?:(job opening -))(?=\s+|$)/gi;

const validateUrl = (value) => /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(value);

const syncToLocalFile = (data) =>
  fs.writeFile('.data/db/jobs/jobs.json', JSON.stringify(data), (err) => {
    if (err) {
      console.log('could not backup listings to file');
    }
  });

module.exports = function (controller) {

  controller.on('direct_message,direct_mention,mention,ambient', function (bot, message) {

    if (message.text !== undefined) {
      let text = message.text.replace('<', '').replace('>', '');
      text.split('|').forEach(url => {
        let isUrl = validateUrl(url);
        if (isUrl) {
          testJobLink(url, bot, controller, message);
        }
      });
    }
  });
};

function testJobLink(url, bot, controller, message) {
  let job = {};
  request.get({ uri: url, headers: { 'User-Agent': 'Mozilla/5.0' } }, (err, r, body) => {
    if (err) {
      console.log('error making request for url: ', url);
      bot.reply(message, 'request failed ' + err);
      return;
    }
    if (r.statusCode != 200) {
      console.log('bad status ', r.statusCode, 'for url: ', url);
      bot.reply(message, `could not reach page, got ${r.statusCode}`);
    } else {
      job.url = url;
      job.postedBy = '';
      job.postedOn = moment().format('YYYY-MM-DD');
      let pageTitle = new JSDOM(body).window.document.title;
      if (pageTitle === '' || pageTitle === undefined) {
        pageTitle = 'could not extract title';
      }
      job.pageTitle = pageTitle.replace(STOPWORDS, '').trim();
      bot.api.users.info({ user: message.event.user }, (err, response) => {
        job.postedBy = response.name;
      });
      startInteractiveConvo(bot, message, controller, job);
    }
  });
}

function startInteractiveConvo(bot, message, controller, job) {
  bot.startConversation(message, function (err, convo) {
    convo.say({
      ephemeral: true, attachments: [
        {
          title: `Extracted job title as: <${job.pageTitle}> does that look right?`,
          callback_id: 'job_callback',
          attachment_type: 'default',
          actions: [
            {
              'name': 'yes',
              'text': 'Yes',
              'value': 'yes',
              'type': 'button',
            },
            {
              'name': 'no',
              'text': 'No',
              'value': 'no',
              'type': 'button',
            }
          ]
        }
      ]
    });
  });

  controller.on('interactive_message_callback', function (bot, message) {
    if (message.callback_id === 'job_callback') {
      if (message.text === 'no') {
        let dialog = bot.createDialog(
          'GDC Bot',
          'job_callback',
          'Submit'
        ).addText('What\'s the job title?', 'text');
        bot.replyWithDialog(message, dialog.asObject());
      } else {
        bot.replyInteractive(message, 'Thank you!');
      }
    }
  });

  controller.on('dialog_submission', function handler(bot, message) {
    if (message.callback_id === 'job_callback') {
      if (message.submission.hasOwnProperty('text')) {
        job.pageTitle = message.submission.text;
      }
      bot.replyInteractive(message, `Thanks I've changed the title to: ${job.pageTitle}`);
      bot.dialogOk();
    }
  });
}