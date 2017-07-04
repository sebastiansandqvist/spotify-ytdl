const YoutubeMp3Downloader = require('youtube-mp3-downloader');

const downloader = new YoutubeMp3Downloader({
  outputPath: '.',
  youtubeVideoQuality: 'highest',
  progressTimeout: 250,
});

module.exports = downloader;
