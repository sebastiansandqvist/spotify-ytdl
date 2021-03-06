const { promisify } = require('util');
const { fork } = require('child_process');
const { cyan, dim, green, red } = require('chalk');
const ytSearch = promisify(require('youtube-search'));
const writeMetadata = promisify(require('ffmetadata').write);
const { makeQuery } = require('./shared');
const renderInterface = require('./ui');
const downloader = require('./downloader');
const stream = require('./stream');
// const retry = require('./retry'); // TODO: retry failures

// TODO: use cluster and restart failed child process
const terminalLogs = [];
const listenerProcess = fork(`${__dirname}/listenerProcess.js`);

function logStringified(item) {
  if ((typeof item === 'string') || (typeof item === 'number')) console.log(item);
  else console.log(JSON.stringify(item, null, 2));
}


function quit(screen) {
  screen.destroy();
  terminalLogs.forEach(logStringified);
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


function getFilename({ artist, title }) {
  return `[${artist}] ${title}.mp3`;
}


function main() {

  const { screen, list, log, textbox } = renderInterface();

  screen.key(['escape', 'q', 'C-c', 'C-d'], () => quit(screen));
  textbox.key(['C-c', 'C-d'], () => quit(screen));

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


  // { [youtubeId]: { title, artist, album, disc, track } }
  // where metadata comes from spotify
  const fullMetadata = {};

  let results = null;

  function performPop() {
    queue.pop();
    list.popItem();
    if (queue.length === 0) upNext.set(null);
  }

  function downloadById(videoId, metadata, cb) {
    log.setText(green('Downloading...'));
    textbox.clearValue();

    terminalLogs.push(Object.assign({ videoId }, metadata));
    fullMetadata[videoId] = metadata;
    results = null;
    downloader.download(videoId, getFilename(metadata));

    // .once('finished') wrapper limits downloader to one track at a time
    downloader.once('finished', () => cb());
  }

  // Infinite read loop for input
  function read() {

    const onDownloadComplete = () => {
      textbox.clearValue();
      grabNextTrack();
      read();
    };

    textbox.readInput(function(_, command) {
      const n = parseInt(command, 10);
      if (command === 'q') quit(screen);
      else if (command === 's') grabNextTrack();
      else if (command === 'p') performPop();
      else if (command.length > 1 && upNext.value) return void downloadById(command, upNext.value, onDownloadComplete);
      else if (results && results[n - 1] && upNext.value) return void downloadById(results[n - 1].id, upNext.value, onDownloadComplete);
      else log.add(red('Command could not be executed'));
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

    try { results = await search(makeQuery(track)); }
    catch (err) {
      log.add(red('Search failed\n'));
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

  function handleTrack(message) {
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

  // Note: list element must only contain unique items
  listenerProcess.on('message', function(message) {
    switch (message.type) {
      case 'track':
        handleTrack(message);
        break;
      case 'error':
        terminalLogs.push(red(message.errorMessage));
        quit(screen);
        break;
      default:
        terminalLogs.push(red(`Error: invalid message type ${message.type}`));
    }
  });


  downloader.on('progress', function(event) {
    textbox.setValue(`[Progress] ${event.progress.percentage | 0}%`);
    screen.render();
  });

  downloader.on('finished', function(err, data) {
    if (err || !data) return void terminalLogs.push(red('Download error occurred'));
    const metadata = fullMetadata[data.videoId];
    if (!metadata) return void terminalLogs.push(red(`Could not get metadata for ${data.videoId} | ${data.title}`));
    writeMetadata(getFilename(metadata), metadata)
      .then(() => terminalLogs.push(green('Success')))
      .catch(() => terminalLogs.push(red(`Could not set metadata for ${data.videoId} | ${data.title}`)));
  });

}

module.exports = main;
