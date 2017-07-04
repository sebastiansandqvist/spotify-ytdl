module.exports = {
  makeQuery(metadata) {
    return `${metadata.artist}  -  ${metadata.title}`;
  },
};
