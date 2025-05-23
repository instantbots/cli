const { Command } = require('cmnd');
const io = require('io');
const colors = require('colors/safe');
const inquirer = require('inquirer');

const SettingsManager = require('../helpers/settings_manager.js');
const constants = require('../helpers/constants.js');

class LoginCommand extends Command {

  constructor() {
    super('login');
  }

  help () {
    return {
      description: 'Login to the Instant.bot Package Registry',
      args: [],
      flags: {},
      vflags: {
        email: 'E-mail to login with',
        password: 'Password to login with'
      }
    };
  }

  async run (params) {

    let host = (params.flags.h || [])[0] || constants.BASE_URL;
    if (!host.startsWith('http://') && !host.startsWith('https://')) {
      host = host.startsWith('localhost')
        ? `http://${host}`
        : `https://${host}`
    }

    let email = ((params.vflags.email || [])[0] || '').trim();
    let password = ((params.vflags.password || [])[0] || '').trim();

    const inquireList = [];
    const requestParams = {};

    if (!email) {
      inquireList.push({
        name: 'username',
        type: 'input',
        message: `E-mail / username`
      });
    } else {
      requestParams['username'] = email;
    }

    if (!password) {
      inquireList.push({
        name: 'password',
        type: 'password',
        message: `Password`
      });
    } else {
      requestParams['password'] = password;
    }

    let loginResult = await inquirer.prompt(inquireList);

    const sendParams = {
      ...requestParams,
      ...loginResult,
      grant_type: 'password'
    };

    let result = await io.post(
      `${host}/auth`,
      null,
      null,
      sendParams
    );

    if (result.statusCode !== 200) {
      const e = result.data.error;
      const message = e.message;
      const details = e.details || {};
      const more = [];
      if (Object.keys(details).length) {
        for (const key in details) {
          more.push(`- ${colors.bold(key)}: ${details[key].message}`);
        }
      }
      throw new Error(
        message +
        (
          more.length
            ? '\n\n' + more.join('\n')
            : ''
        )
      );
    }

    const user = result.data; // grab json {data:}
    const token = user.accessTokens[0];

    console.log();
    console.log(colors.bold(`${colors.cyan(`Logged in`)} to ${colors.green('Instant.bot')} successfully!`));
    console.log(`${colors.bold(`email`)}:    ${user.email}`);
    if (user.memberships && user.memberships.length) {
      console.log(`${colors.bold(`username`)}: ${user.memberships[0].organization.name}`);
    }
    console.log(`${colors.bold(`login at`)}: ${token.created_at}`);
    console.log();

    const data = {email: user.email, key: token.key};
    if (host !== constants.BASE_URL) {
      data.host = host;
    }

    // Write settings
    SettingsManager.write(data);

    return void 0;

  }

}

module.exports = LoginCommand;
