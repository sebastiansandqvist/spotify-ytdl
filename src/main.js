const { promisify } = require('util');
const { fork } = require('child_process');
const { cyan, dim, green, red } = require('chalk');
const ytSearch = promisify(require('youtube-search'));
const { makeQuery } = require('./shared');
const renderInterface = require('./ui');
const downloader = require('./downloader');
const stream = require('./stream');
const retry = require('./retry');

// TODO: allow retry on failed fetch


// TODO: use cluster
const terminalLogs = [];
const listenerProcess = fork(`${__dirname}/listenerProcess.js`);


function quit(screen) {
  screen.destroy();
  terminalLogs.forEach((item) => console.log(JSON.stringify(item, null, 2)));
  listenerProcess.kill();
  process.exit(0);
}


function includesQuery(queue, query) {
  for (let i = 0; i < queue.length; i++) {
    if (makeQuery(queue[i]) === query) return true;
  }
  return false;
}


async function search(query) {
  const API_KEY = 'AIzaSyDw0UvCtibVbsOlnhuPu2ju1BARm3168mk';
  const opts = { key: API_KEY, maxResults: 3, type: 'video' };
  const results = await ytSearch(query, opts);
  return results;
}

function main() {
  const { screen, list, log, textbox } = renderInterface();

  // Global keybindings
  screen.key(['escape', 'q', 'C-c', 'C-d'], function() {
    quit(screen);
  });

  textbox.key(['C-c', 'C-d'], function() {
    quit(screen);
  });

  const upNext = stream();

  // Queue only includes upcoming items, not current item
  const queue = [];

  function grabNextTrack() {
    if (queue.length === 0) {
      log.setText('Waiting for a track...');
      upNext.set(null);
    }
    else {
      const nextTrack = queue.shift();
      list.removeItem(makeQuery(nextTrack));
      upNext.set(nextTrack);
    }
  }

  let results = null;

  function download(resultIndex) {
    const spotifyTitle = upNext.title; // upNext has metadata from Spotify
    const selection = results[resultIndex - 1]; // selection has metadata from YouTube
    if (!selection) { return; }
    const { id, title, link } = selection;
    terminalLogs.push({ id, title, spotifyTitle, link });
    results = null;
    downloader.download(id, spotifyTitle);
  }

  function performPop() {
    queue.pop();
    list.popItem();
    if (queue.length === 0) upNext.value = null;
  }

  // Infinite read loop for input
  function read() {
    textbox.readInput(function(_, command) {
      const n = parseInt(command, 10);
      if (command === 'q') quit(screen);
      else if (command === 's') grabNextTrack();
      else if (command === 'p') performPop();
      else if (isNaN(n)) log.add(red('Unknown command: '.concat(command)));
      else if (!results || n < 1 || n > results.length) log.add(red('Out of range'));
      else {
        log.setText(green('Downloading...'));
        download(n);
        textbox.clearValue();
        // the `once finished` wrapper might not be necessary
        // does it fix the `too many redirects` bug?
        downloader.once('finished', () => {
          textbox.setValue('');
          grabNextTrack();
          read();
        });
        return;
      }
      textbox.clearValue();
      screen.render();
      read();
    });
  }
  read();

  async function handleNext(track) {
    if (!track) return;
    log.setText('');
    log.add(cyan('Searching: '), makeQuery(track), '\n');

    async function doSearch() {
      results = await search(makeQuery(track));
    }

    const MAX_RETRIES = 3;

    function onRetry(count) {
      log.add(red(`Search failed. Trying ${MAX_RETRIES - count} more time(s)`));
    }

    try { await retry(MAX_RETRIES)(doSearch, onRetry); }
    catch (err) {
      log.add(red('Search failed.'));
      terminalLogs.push(red(`Error: ${err.message}`));
      results = [];
    }

    if (results.length === 0) log.add('No results found\n');
    results.forEach(function(result, i) {
      log.add(cyan(`${i + 1}.`).concat('  ').concat(result.title));
      log.add('     '.concat(green(result.link)).concat('\n'));
    });
    log.add(cyan('s').concat('   Skip this track\n'));
    log.add(cyan('p').concat('   Pop most recent item off queue\n'));
    log.add('    Anything else will be treated as a custom video ID\n');
  }

  upNext.map(handleNext);

  // Note: list element must only contain unique items
  listenerProcess.on('message', function(message) {
    if (message.type === 'track') {
      const q = makeQuery(message.data);
      if (!upNext.value) {
        upNext.set(message.data);
      }
      else if ((makeQuery(upNext.value) !== q) && !includesQuery(queue, q)) {
        queue.push(message.data);
        list.add(q);
      }
      screen.render();
    }
  });


  downloader.on('progress', function(event) {
    textbox.setValue(`[Progress] ${event.progress.percentage | 0}%`);
    screen.render();
  });


}

module.exports = main;
