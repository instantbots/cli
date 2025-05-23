const { Command } = require('cmnd');
const colors = require('colors/safe');

const loadPackage = require('../../helpers/load_package.js');
const generateEndpoint = require('../../helpers/generate/endpoint/_index.js');

class GenerateEndpointCommand extends Command {

  constructor() {
    super('g', 'endpoint');
  }

  help () {
    return {
      description: 'Generates a new endpoint file in a directory of your choosing',
      args: ['pathname'],
      flags: {},
      vflags: {}
    };
  }

  async run (params) {

    const InstantPackage = await loadPackage(params, true);
    await generateEndpoint(InstantPackage, params);
    return void 0;

  }

}

module.exports = GenerateEndpointCommand;
