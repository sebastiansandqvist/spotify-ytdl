const blessed = require('blessed');

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
    height: '100%-5',
    width: '100%-5',
    left: 0,
    top: 1,
  });
}

// TODO: make a dedicated area for logging progress
// put it beneath the queue (fixed to bottom of screen)
// Could be type of log or progress

function makeInput() {
  return blessed.textbox({
    height: 1,
    width: '100%-5',
    padding: 0,
    left: 0,
    bottom: 0,
  });
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

module.exports = renderInterface;
