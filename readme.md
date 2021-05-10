# My tools for OpenStreetMap edit analysis, reverts and redaction.

Main tool is `boca.mjs`, its previous generation is `tool.js` with `server.js`, others are smaller or unfinished tools.

## Installation

Requires node.js 14, maybe works on 13.
No package is published yet, so download the code and install the dependencies with `npm install`.
The heaviest installation step is building expat library.
Currently doesn't register executable files, just run the scripts with `node `*(script name)*.

## boca.mjs "Bunch-of-changesets analyser"

Run `boca.mjs` with a directory name to start a server.
A new browser window is going to be automatically opened.
I will try to make the documentation available inside the served web pages.

## tool.js / server.js

Use `tool.js` downloads all changeset data for a given user.

After that `server.js` can be used to:

* show edit counts for element types, tags, editors etc
* download changed/created/deleted elements as .osm file or open with remote control
* view a list of changed elements showing tag changes
* load elements and undo tag chages with remote control
* update elements with overpass

Data is stored in `user` and `changeset` mostly in xml format.
That's why everything is working very slowly.
These scripts are going to be retired once all the features are ported to `boca.mjs`.

## caser.js

Watchlist with markdown-like syntax.

## Smaller tools

### convert.js

Convert .osm or .gpx to .kml. Turns maps.me fake-pois-actually-bookmarks into bookmarks.

### download2.js

TODO downloads from osm to .json for use with relation2.js. Probably going to be scrapped.

### open-overpass-turbo.mjs

Open a new browser window in a location specified by URL parameter.
Currently works with OpenStreetMap #map URLs.
Uses not very documented `https://overpass-turbo.eu?C=lat;lon;zoom` request.

### relation.js

Shows relation membership changes.

### relation2.js

TODO shows relations in a changeset. I think it became a changeset viewer implemented with leaflet.

### store.js

Converts osm data in .osm/OsmChange formats to .json.
