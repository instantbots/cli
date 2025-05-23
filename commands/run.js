const { Command } = require('cmnd');
const colors = require('colors/safe');
const io = require('io');
const kill = require('tree-kill');

const loadPackage = require('../helpers/load_package.js');
const localServer = require('../helpers/local_server.js');

const sleep = t => new Promise(r => setTimeout(() => r(1), t));
const killProcess = pid => {
  return new Promise((resolve, reject) => {
    kill(pid, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(true);
      }
    });
  });
};

class RunCommand extends Command {

  constructor() {
    super('run');
  }

  help() {
    return {
      description: 'Runs a function in the local project',
      args: [],
      flags: {
        'm': 'Specify method, default is "get"',
        'v': 'Verbose mode: shows URL, status code and arguments'
      },
      vflags: {
        '*': 'Used to populate query and / or body parameters'
      }
    };
  }

  async run(params) {

    // Use 8199 for test runs
    const InstantPackage = await loadPackage(params, true);
    const port = 8199;
    const timeout = 5000;
    const url = `http://localhost:${port}`;

    // Validate arguments, default method is "get"
    const method = ((params.flags['m'] || [])[0] || 'get').toLowerCase();
    if (['get', 'post', 'put', 'delete', 'del'].indexOf(method) === -1) {
      throw new Error(`Method "${method}" not supported.`);
    }
    if (method === 'del') {
      method = 'delete';
    }
    const functionParams = Object.keys(params.vflags).reduce((functionParams, key) => {
      functionParams[key] = params.vflags[key].join(' ');
      return functionParams;
    }, {});
    let pathname = params.args[0] || '';
    if (!pathname) {
      throw new Error(
        `Please provide a pathname as the first argument.\n` +
        `Use "/" to execute the root method (index.js)`
      );
    }
    if (pathname.startsWith('..')) {
      throw new Error(`Invalid pathname: "${pathname}"`);
    }
    if (pathname.startsWith('.')) {
      pathname = pathname.slice(1);
    }
    if (pathname.startsWith('/')) {
      pathname = pathname.slice(1);
    }

    const proc = localServer.run({ port, isBackground: true });
    let isConnected = false;
    proc.stdout.on('data', data => {
      const message = data.toString();

      if (message.includes(`*** Listening on localhost:${port}`)) {
        isConnected = true;
      } else if (message.includes(`Unable to spawn HTTP Workers, listening on port ${port}`)) {
        isConnected = true;
      }
    });

    // Wait for connection or timeout
    let isTimedOut = false
    await Promise.race([
      (async () => {
        await sleep(timeout);
        if (!isConnected) {
          isTimedOut = true;
          await killProcess(proc.pid);
          throw new Error(
            `Timed out waiting for development server.\n` +
            `Are you sure you're not running another server on :${port}?\n` +
            `To kill any processes running on this port on a unix system, use:\n` +
            `$ lsof -ti :${port} | xargs kill -9`
          );
        }
      })(),
      (async () => {
        while (!isConnected && !isTimedOut) {
          await sleep(1);
        }
        return true;
      })()
    ]);

    const queryParams = (method === 'get' || method === 'delete')
      ? { ...functionParams }
      : {};
    queryParams._debug = true;
    const bodyParams = (method === 'post' || method === 'put')
      ? JSON.stringify(functionParams)
      : '';

    let result;
    const streamResult = await io.request(
      method.toUpperCase(),
      `${url}/${pathname}`,
      queryParams,
      {},
      bodyParams,
      ({id, event, data}) => {
        if (event === '@response') {
          let json = JSON.parse(data);
          result = json;
        } else if (event === '@stdout') {
          let json = JSON.parse(data);
          json.split('\n').forEach(line => {
            console.log(colors.grey(`${params.flags.v ? colors.bold(`stdout> `) : ''}${line}`));
          });
        } else if (event === '@stderr') {
          let json = JSON.parse(data);
          json.split('\n').forEach(line => {
            console.log(colors.yellow(`${params.flags.v ? colors.bold(`stderr> `) : ''}${line}`));
          });
        } else {
          console.log(colors.blue(`${colors.bold(`${event}> `)}${data}`));
        }
      }
    );

    // Handle non-event errors given by server
    if (streamResult.statusCode === 500) {
      const errorBody = streamResult.body.toString();
      let errorMessage = errorBody;
      // cut out the "Application Error: " prefix and only capture the first line
      if (errorBody.startsWith('Application Error:')) {
        errorMessage = errorBody.slice('Application Error: '.length);
      }
      // ignore the stack trace
      errorMessage = errorMessage.split('\n')[0];
      throw new Error(errorMessage);
    }

    // retrieve details
    const body = result.body.toString();
    let json;
    try {
      json = JSON.parse(body);
    } catch (e) {
      // do nothing
    }

    // Terminate process
    await killProcess(proc.pid);
    if (params.flags.v) {
      console.log(colors.bold.green('location:  ') + `${url}/${pathname}`);
      console.log(colors.bold.green('method:    ') + method.toUpperCase());
      console.log(colors.bold.green('status:    ') + result.statusCode);
      console.log(colors.bold.green('arguments: '));
      console.log(JSON.stringify(functionParams, null, 2));
      console.log(colors.bold.green('result:'));
    }
    if (json) {
      console.log(JSON.stringify(json, null, 2));
    } else {
      console.log(body);
    }

    return void 0;

  }

}

module.exports = RunCommand;
