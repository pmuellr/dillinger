"use strict"

const path = require(`path`)

const express = require(`express`)

const plugin    = path.basename(__dirname)
const pluginApp = module.exports = express()

console.log(`registering plugin ${plugin}`)

if (process.env.ENABLE_STATS) {
  pluginApp.use(handleRequest)
  pluginApp.use(`/stats`, generateStats)
}

//------------------------------------------------------------------------------
function handleRequest(req, res, next) {
  console.log(`${plugin}: handling request ${req.url}`)

  const hrtimeStart = process.hrtime()

  res.on(`finish`, () => {
    const hrtimeElapsed = process.hrtime(hrtimeStart)
    const timeMS = Math.round(
      (hrtimeElapsed[0] * 1000) +
      (hrtimeElapsed[1] / 1000000)
    )

    processStat(req, timeMS)
  })

  next()
}

//------------------------------------------------------------------------------
const URLStats = new Map()

//------------------------------------------------------------------------------
function generateStats(req, res) {
  const output = []

  for (let key of URLStats.keys()) {
    output.push(`${key}: ${URLStats.get(key).avgTime()}`)
  }

  res.end(output.join('\n'))
}

//------------------------------------------------------------------------------
function processStat(url, timeMS) {
  // get the stat object
  let stats = URLStats.get(url)

  // create new one if we don't already have one
  if (!stats) {
    stats = new DillingerURLStats()
    URLStats.set(url, stats)
  }

  // update stats
  stats.addTime(timeMS)
}

//------------------------------------------------------------------------------
class DillingerURLStats {
  constructor() {
    this.count     = 0
    this.totalTime = 0
  }

  addTime(timeMS) {
    this.count++
    this.totalTime += timeMS
  }

  avgTime() {
    return Math.round(this.totalTime / this.count)
  }
}
