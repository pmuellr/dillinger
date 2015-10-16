# Dillinger performance issue diagnosed with N|Solid

Dillinger, like most express-based, template-using applications has a built-in
performance issue.  You need to set the env var `NODE_ENV` to `production`, or
else the templates are compiled each time a request is made.

Launch Dillinger with:

    NSOLID_APPNAME=dillinger NSOLID_HUB=4001 node app

And then make 1000 requests with ab or the like:

    ab -n 1000 -c 100  http://localhost:8080/

You'll see the 50% response time is in the 100's of milliseconds!  It should be
10's of millseconds!

In the N|Solid Console, select the Dillinger process to profile, and expand
details so you can be ready to click the "New Profile" button.  Then run 5000
requests, so you have time to click the profile button and run for 5 seconds.
5000 requests should take ~20 seconds.

    ab -n 5000 -c 100  http://localhost:8080/

In the flame graph, you should see two thick towers. As you hover over the
layers starting from the bottom, you will eventually see a function call
`Template.compile`, which is eating the significant chunk of time across those
towers.  "Ah", you say to yourself, "it's compiling the templates!  Need to
set `NODE_ENV=production`".  This is actually a fairly common problem.

Relaunch with that set, run ab again

    NODE_ENV=production NSOLID_APPNAME=dillinger NSOLID_HUB=4001 node app

    ab -n 5000 -c 100  http://localhost:8080/

Now you'll see the 50% response time number in the 10's of milliseconds.



# Dillinger memory leak diagnosed with N|Solid

This branch of Dillinger includes a plugin which exhibit a memory leak:
`plugins/stats`.  This plugin is installed in the middleware chain early, so
every request will go through it.  The intention is to track the average time
it takes to process each request, grouped by URL.  Unfortunately, a mistake
was made in using keys for the Map where the stats are held.

To enabled this plugin, to see the leak, run Dillinger with the `ENABLE_STATS`
env var set to anything; the plugin won't do anything unless this is set.

    ENABLE_STATS=1 NSOLID_APPNAME=dillinger NSOLID_HUB=4001 node app

Once you've launched Dillinger, open up the N|Solid console, find the process
and go to the Process view to watch the stats.

Now hit Dillinger with ab, 500 times.

    ab -n 500 -c 100  http://localhost:8080/

Run this a few times, and you'll see the heap numbers going generally up. Don't
let the "Heap Used" number go much over 200MB, as generating the snapshot
becomes expensive.  You could continually hit the URL to see the numbers going
up, then kill Dillinger, start it again, make just a few number of requests,
and then run the snapshot.

Click on "New Snapshot".

When viewing the heap snapshot, the easiest way to spot the problem is to sort
on the "Objects" column.  You can see the "DillingerURLStats" object has as many
objects as requests you made, when in fact it should probably only have one
instance.  In addition, you can also see Cookies, IncomingMessage,
ServerResponse, Session, and Socket all have about the same number of objects.
That's the clue!  For "some reason", all the data associated with the request
(all those other objects) have the same # of objects as the DillingerURLStats
object count, when in fact those objects should all be garbage collected.
Someone is clearly holding onto a Request or Response object, and the likely
candidate appears to be DillingerURLStats!

The problem is that the global Map `URLStats` should be using the request URL as
the key, but instead uses the Request object itself.  So every request will have
it's Request object stored in a global variable.  This leaks a fair bit of
memory.

The problem is in `plugins/stats/server.js`.  The line in the `handleRequest()`
function:

    processStat(req, timeMS)

should instead be:

    processStat(req.url, timeMS)

The Map will then be using the URL of the request as the key, instead of the
Request object itself.
