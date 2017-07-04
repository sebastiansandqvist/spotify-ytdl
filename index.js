const { promisify } = require('util');
const { fork } = require('child_process');
const blessed = require('blessed');
const ytSearch = promisify(require('youtube-search'));
const { cyan, dim, green, red } = require('chalk');
const { makeQuery } = require('./shared');

// TODO: allow retry on failed fetch

// ---------------------------------------------------

// TODO: make this its own file
const YoutubeMp3Downloader = require('youtube-mp3-downloader');

const YD = new YoutubeMp3Downloader({
  outputPath: '.',
  youtubeVideoQuality: 'highest',
  progressTimeout: 250,
});

// ------------------------------------------------- ^


const terminalLogs = [];
const listenerProcess = fork(`${__dirname}/listenerProcess.js`);


function stream(initialValue = null) {
  const s = {
    value: initialValue,
    listeners: [],
  };
  s.map = function(cb) {
    if (s.listeners.indexOf(cb) === -1)
      s.listeners.push(cb);
  };
  s.set = async function(x) {
    s.value = x;
    for (let i = 0; i < s.listeners.length; i++)
      await s.listeners[i](x);
  };
  return s;
}



function makeScreen() {
  return blessed.screen({
    title: 'Spotify YouTube Downloader',
    autoPadding: true,
    dockBorder: false,
    smartCSR: true,
  });
}

function makeList() {
  return blessed.list({
    label: ' Queue ',
    height: '100%',
    width: '40%',
    padding: 1,
    left: 0,
    top: 0,
    border: { type: 'line' },
    style: { border: { fg: 'green' } },
    scrollable: true,
  });
}

function makeTerminal() {
  return blessed.log({
    label: ' Spotify YouTube Downloader ',
    height: '100%',
    width: '60%',
    padding: { left: 2, bottom: 0, top: 0, right: 0 },
    left: '40%',
    top: 0,
    border: { type: 'line' },
    style: { border: { fg: 'green' } },
  });
}

function makeLog() {
  return blessed.log({
    // label: ' Log ',
    height: '100%-5',
    width: '100%-5',
    left: 0,
    top: 1,
  });
}

function makeInput() {
  return blessed.textbox({
    // label: ' Input ',
    height: 1,
    width: '100%-5',
    padding: 0,
    left: 0,
    bottom: 0,
    // inputOnFocus: true,
  });
}

function quit(screen) {
  screen.destroy();
  terminalLogs.forEach((item) => console.log(JSON.stringify(item, null, 2)));
  listenerProcess.kill();
  process.exit(0);
}

function renderInterface() {
  const screen = makeScreen();
  const list = makeList();
  const terminal = makeTerminal();
  const log = makeLog();
  const textbox = makeInput();

  terminal.append(log);
  terminal.append(textbox);
  screen.append(list);
  screen.append(terminal);

  return { screen, list, log, textbox };
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
  terminalLogs.push(results[0]);
  return results;
}

function main() {
  const { screen, list, log, textbox } = renderInterface();

  // Global keybindings
  screen.key(['escape', 'q', 'C-c'], function() {
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
    terminalLogs.push({ id, title, link });
    results = null;
    YD.download(id, spotifyTitle);
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
      else if (n < 1 || n > 3) log.add(red('Out of range'));
      else {
        log.setText(green('Downloading...'));
        download(n);
        textbox.clearValue();
        // the `once finished` wrapper might not be necessary
        // does it fix the `too many redirects` bug?
        YD.once('finished', () => {
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

  // TODO: allow custom url also
  async function handleNext(track) {
    if (!track) return;
    log.setText('');
    log.add(cyan('Searching: '), makeQuery(track), '\n');
    results = await search(makeQuery(track));
    results.forEach(function(result, i) {
      log.add(cyan(`${i + 1}.`).concat('  ').concat(result.title));
      log.add('     '.concat(green(result.link)).concat('\n'));
    });
    log.add(cyan('s').concat('   Skip this track\n'));
    log.add(cyan('p').concat('   Pop most recent item off queue\n'));
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


  YD.on('progress', function(event) {
    textbox.setValue(`[Progress] ${event.progress.percentage | 0}%`);
    screen.render();
  });


}

main();
