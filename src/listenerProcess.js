const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { makeQuery } = require('./shared');

async function get(prop) {
  return exec(`playerctl metadata ${prop}`)
    .then((results) => results.stdout)
    .catch((err) => process.send({ type: 'error', errorMessage: err.message }));
}

async function getMetadata() {
  return {
    album: await get('album'),
    artist: await get('artist'),
    disc: Number(await get('xesam:discNumber')),
    title: await get('title'),
    track: Number(await get('xesam:trackNumber')),
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let priorQuery = '';

async function main() {
  const data = await getMetadata();
  const currentQuery = makeQuery(data);
  if (priorQuery !== currentQuery) {
    priorQuery = currentQuery;
    process.send({ type: 'track', data });
  }
  await wait(1000);
  return main();
}

main();

process.on('exit', function() {
  console.log('Child process exiting...');
});

process.on('SIGTERM', function() {
  console.log('Child process terminating...');
  process.exit(0);
});
