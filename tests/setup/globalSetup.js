const { MongoMemoryServer } = require("mongodb-memory-server");
const path = require("path");
const fs = require("fs");

module.exports = async function () {
  const mongod = await MongoMemoryServer.create();
  global.__MONGOD__ = mongod;
  const uri = mongod.getUri();
  fs.writeFileSync(path.join(__dirname, "../.test-mongo-uri"), uri);
};
