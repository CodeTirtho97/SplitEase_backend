const path = require("path");
const fs = require("fs");

module.exports = async function () {
  if (global.__MONGOD__) {
    await global.__MONGOD__.stop();
  }
  const uriFile = path.join(__dirname, "../.test-mongo-uri");
  if (fs.existsSync(uriFile)) {
    fs.unlinkSync(uriFile);
  }
};
