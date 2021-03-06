/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var _ = require('underscore')
var request = require('request')
var ProxyAgent = require('proxy-agent')

var agent
if (!process.env.LOCAL) {
  console.log("configuring proxy agent")
  agent = new ProxyAgent(process.env.FIXIE_URL)
}

// Summarize a group of publishers created on the same day
function summarizeGroup (created, group) {
  var stats = {
    created: created,
    ymd: created,
    verified: 0,
    authorized: 0,
    total: 0,
    irs: 0,
    address: 0
  }
  _.each(group, function (publisher) {
    stats.verified = stats.verified + (publisher.verified ? 1: 0)
    stats.authorized = stats.authorized + (publisher.authorized ? 1: 0)
    stats.irs = stats.irs + (publisher.legalFormURL ? 1 : 0)
    stats.total += 1
  })
  return stats
}

function summarizePublishers (publishers) {
  // calculate the ymd date
  _.forEach(publishers, function (publisher) {
    publisher.created_ts = publisher.history[0].created / 1000
    publisher.created = (new Date(publisher.created_ts * 1000)).toISOString().slice(0, 10)
  })

  // group and summarize within a day
  var grouped = _.groupBy(publishers, function (publisher) { return publisher.created })
  var mapped = _.map(grouped, function (group, created) { return summarizeGroup(created, group)})

  return mapped
}

export function all (done) {
  var intervalID
  var limit = 40
  var delay = 10000

  var token = process.env.EYESHADE_TOKEN
  var options = {
    uri: "https://eyeshade.brave.com/v2/reports/publishers/status?format=json&summary=true&access_token=" + token,
    method: 'GET'
  }
  if (agent) options.agent = agent

  request(options, function (err, response, body) {
    var reportURL, intervalId, results
    if (response.statusCode === 200) {
      reportURL = JSON.parse(body).reportURL
      console.log(reportURL)
      intervalID = setInterval(function () {
        var reportOptions = {
          method: "GET",
          uri: reportURL
        }
        if (agent) reportOptions.agent = agent
        request(reportOptions, function (err, response, body) {
          console.log("checking " + limit + ' - ' + response.statusCode)
          if (response.statusCode === 200) {
            clearInterval(intervalID)
            results = summarizePublishers(JSON.parse(body.replace(/[\x00-\x1f]/g, "")))
            done(null, results)
          } else {
            limit -= 1
            if (limit === 0) process.exit(1)
          }
        })
      }, delay)
    }
  })
}
