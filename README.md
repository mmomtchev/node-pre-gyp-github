# node-pre-gyp-github
##### A node-pre-gyp module which provides the ability to publish to GitHub releases.

[![License: MIT](https://img.shields.io/github/license/mmomtchev/node-pre-gyp-github)](https://github.com/mmomtchev/rlayers/blob/master/LICENSE)
[![npm version](https://img.shields.io/npm/v/@mmomtchev/node-pre-gyp-github)](https://www.npmjs.com/package/@mmomtchev/node-pre-gyp-github)
[![Node.js CI](https://github.com/mmomtchev/node-pre-gyp-github/actions/workflows/node.js.yml/badge.svg)](https://github.com/mmomtchev/node-pre-gyp-github/actions/workflows/node.js.yml)
[![codecov](https://codecov.io/gh/mmomtchev/node-pre-gyp-github/branch/master/graph/badge.svg?token=OE1AXIYFIZ)](https://codecov.io/gh/mmomtchev/node-pre-gyp-github)


This package is an almost complete rewrite using a modern API of [node-pre-gyp-github](https://github.com/bchr02/node-pre-gyp-github) by [@bchr02](https://github.com/bchr02) which is not maintained anymore and does not work with the recent changes in the Github API.

It aims to be compatible with the original package.

## Usage
Instead of `node-pre-gyp publish` use **`node-pre-gyp-github publish`**

## Options for publish command
* --silent : Turns verbose messages off.
* --release : Publish the GitHub Release immediately instead of creating a Draft.

  For Ex. `node-pre-gyp-github publish --release`

## Install
```bash
npm install -g node-pre-gyp-github
```

## Configuration
This module is intended to be used with node-pre-gyp. Therefore, be sure to configure and install node-pre-gyp first. After having done that, within **`package.json`** update the `binary` properties `host` and `remote_path` so it matches the following format:

```json
  "host": "https://github.com/[owner]/[repo]/releases/download/",
  "remote_path": "{version}"
```

Be sure to replace `[owner]`, `[repo]`, with actual values,
but DO NOT replace `{version}` with actual version.

***WARNING: Variable substitutions are not supported on the ```host``` property and on the ```remote_path``` only ```{version}``` placeholder is supported. The value of ```remote_path``` after substitution will become a release tag name. Do not use [forbidden git tag characters](https://git-scm.com/docs/git-check-ref-format) for ```version``` and ```remote_path``` properties.***

Within GitHub, create a new authorization:

1. go to Settings 
2. click Personal access tokens
3. click Generate new token
4. Select "public_repo" and "repo_deployment"
5. Generate Token
6. copy the key that's generated and set NODE_PRE_GYP_GITHUB_TOKEN environment variable to it. Within your command prompt:

```
SET NODE_PRE_GYP_GITHUB_TOKEN=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

## Examples 

### Publish to GitHub as a Draft Release
```bash
node-pre-gyp configure
node-pre-gyp build
node-pre-gyp package
node-pre-gyp-github publish
```

### Publish to GitHub as a Release
```bash
node-pre-gyp configure
node-pre-gyp build
node-pre-gyp package
node-pre-gyp-github publish --release
```

## License

Copyright &copy; 2015–2016 [Bill Christo](https://github.com/bchr02) & [Contributors](https://github.com/bchr02/node-pre-gyp-github/graphs/contributors)

Copyright &copy; 2021 [Momtchil Momtchev, @mmomtchev](https://github.com/mmomtchev) & [Contributors](https://github.com/mmomtchev/node-pre-gyp-github/graphs/contributors)

Licensed under the MIT License

