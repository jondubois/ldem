const path = require('path');
const fs = require('fs');
const util = require('util');
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const unlink = util.promisify(fs.unlink);
const LDEM = require('./index');
const argv = require('minimist')(process.argv.slice(2));

const CWD = process.cwd();
const CONFIG_PATH = path.resolve(CWD, argv.c);
const CONFIG_UPDATES_DIR_PATH = argv.u ? path.resolve(CWD, argv.u) : null;

const config = require(CONFIG_PATH);

(async () => {
  let configUpdates;
  let updateFilePaths = {};
  if (CONFIG_UPDATES_DIR_PATH) {
    let configUpdateFiles = await readdir(CONFIG_UPDATES_DIR_PATH);
    try {
      configUpdates = await Promise.all(
        configUpdateFiles.map(async (fileName) => {
          let filePath = path.resolve(CONFIG_UPDATES_DIR_PATH, fileName);
          let content = await readFile(filePath, {encoding: 'utf8'});
          let update = JSON.parse(content);
          updateFilePaths[update.id] = filePath;
          return update;
        })
      );
    } catch (err) {
      let error = new Error(
        `Failed to load config updates from the ${
          CONFIG_UPDATES_DIR_PATH
        } directory because of error: ${
          err.message
        }`
      );
      throw error;
    }
  } else {
    configUpdates = [];
  }

  let ldem = new LDEM({
    config,
    configUpdates
  });

  (async () => {
    for await (let {moduleAlias, updates, updatedModuleConfig} of ldem.listener('moduleUpdate')) {
      config.modules[moduleAlias] = updatedModuleConfig;
      try {
        await writeFile(CONFIG_PATH, JSON.stringify(config, ' ', 2));
      } catch (err) {
        throw new Error(
          `Failed to write update to config file at path ${CONFIG_PATH} because of error: ${err.message}`
        );
      }
      await Promise.all(
        updates.map(async (update) => {
          let filePath = updateFilePaths[update.id];
          if (filePath) {
            try {
              await unlink(filePath);
            } catch (err) {
              throw new Error(
                `Failed to delete old config update file at path ${filePath} because of error: ${err.message}`
              );
            }
          }
        })
      );
    }
  })();

})();
