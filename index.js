'use strict';

const path = require('path');
const fs = require('fs');
const cwd = process.cwd();

let verbose;
const consoleLog = function (x) {
    return verbose ? console.log(x) : false;
};

function NodePreGypGithub() {}

NodePreGypGithub.prototype.octokit = require('@octokit/rest').Octokit.plugin(
    require('@octokit/plugin-retry').retry
);
NodePreGypGithub.prototype.stage_base_dir = path.join(cwd, 'build', 'stage');
NodePreGypGithub.prototype.init = function () {
    let ownerRepo, hostPrefix;

    this.token = process.env.NODE_PRE_GYP_GITHUB_TOKEN;
    if (!this.token) throw new Error('NODE_PRE_GYP_GITHUB_TOKEN environment variable not found');

    this.package_json = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json')));

    if (!this.package_json.repository || !this.package_json.repository.url) {
        throw new Error('Missing repository.url in package.json');
    } else {
        ownerRepo = this.package_json.repository.url.match(/https?:\/\/([^/]+)\/(.*)(?=\.git)/i);
        if (ownerRepo) {
            this.host = 'api.' + ownerRepo[1];
            ownerRepo = ownerRepo[2].split('/');
            this.owner = ownerRepo[0];
            this.repo = ownerRepo[1];
        } else
            throw new Error(
                'A correctly formatted GitHub repository.url was not found within package.json'
            );
    }

    hostPrefix =
        'https://' + this.host + '/' + this.owner + '/' + this.repo + '/releases/download/';
    if (
        !this.package_json.binary ||
        'object' !== typeof this.package_json.binary ||
        'string' !== typeof this.package_json.binary.host
    ) {
        throw new Error('Missing binary.host in package.json');
    } else if (
        this.package_json.binary.host
            .replace('https://', 'https://api.')
            .substr(0, hostPrefix.length) !== hostPrefix
    ) {
        throw new Error('binary.host in package.json should begin with: "' + hostPrefix + '"');
    }

    this.connect();
};

NodePreGypGithub.prototype.connect = function () {
    this.octokit = new NodePreGypGithub.prototype.octokit({
        auth: this.token,
        baseUrl: 'https://' + this.host,
        headers: {
            'user-agent': this.package_json.name ? this.package_json.name : 'node-pre-gyp-github'
        }
    });
};

NodePreGypGithub.prototype.createRelease = async function (args) {
    const options = {
        host: this.host,
        owner: this.owner,
        repo: this.repo,
        tag_name: this.package_json.version,
        name: 'v' + this.package_json.version,
        body: this.package_json.name + ' ' + this.package_json.version,
        draft: true,
        prerelease: false
    };

    for (const key of Object.keys(args)) {
        if (
            Object.prototype.hasOwnProperty.call(args, key) &&
            Object.prototype.hasOwnProperty.call(options, key)
        ) {
            options[key] = args[key];
        }
    }
    return this.octokit.repos.createRelease(options);
};

NodePreGypGithub.prototype.deletePartialAssets = async function () {
    try {
        const assets = await this.octokit.repos.listReleaseAssets({
            origin: this.release.upload_url,
            owner: this.owner,
            release_id: this.release.id,
            repo: this.repo
        });
        const partial = assets.data.filter((a) => a.state === 'starter');
        for (const asset of partial)
            await this.octokit.repos.deleteReleaseAsset({
                origin: this.release.upload_url,
                owner: this.owner,
                release_id: this.release.id,
                repo: this.repo,
                asset_id: asset.id
            });
    } catch (e) {
        console.error('Failed deleting partial assets for ', e);
    }
};

NodePreGypGithub.prototype.uploadAsset = async function (cfg) {
    const data = await fs.promises.readFile(cfg.filePath);

    // Network errors leave an asset having a state of `starter`
    // that will block further upload attempts

    let lastErr;
    let retries = 3;
    do {
        try {
            await this.octokit.repos.uploadReleaseAsset({
                origin: this.release.upload_url,
                owner: this.owner,
                release_id: this.release.id,
                repo: this.repo,
                name: cfg.fileName,
                data
            });
            break;
        } catch (e) {
            retries--;
            console.error('Failed uploading ', e);
            console.error(`${retries} left`);
            console.error('');
            lastErr = e;
            await this.deletePartialAssets();
        }
    } while (retries > 0);
    if (retries == 0) throw lastErr;

    consoleLog(
        'Staged file ' +
            cfg.fileName +
            ' saved to ' +
            this.owner +
            '/' +
            this.repo +
            ' release ' +
            this.release.tag_name +
            ' successfully.'
    );
};

NodePreGypGithub.prototype.uploadAssets = async function () {
    let asset;
    consoleLog('Stage directory path: ' + path.join(this.stage_dir));
    const files = await fs.promises.readdir(path.join(this.stage_dir));

    if (!files.length)
        throw new Error('No files found within the stage directory: ' + this.stage_dir);

    const q = [];
    for (const file of files) {
        if (this.release && this.release.assets) {
            asset = this.release.assets.filter(function (element) {
                return element.name === file;
            });
            if (asset.length) {
                throw new Error(
                    'Staged file ' +
                        file +
                        ' found but it already exists in release ' +
                        this.release.tag_name +
                        '. If you would like to replace it, you must first manually delete it within GitHub.'
                );
            }
        }
        consoleLog('Staged file ' + file + ' found. Proceeding to upload it.');
        q.push(
            this.uploadAsset({
                fileName: file,
                filePath: path.join(this.stage_dir, file)
            })
        );
    }
    return Promise.all(q);
};

NodePreGypGithub.prototype.publish = async function (options) {
    options = typeof options === 'undefined' ? {} : options;
    verbose = typeof options.verbose === 'undefined' || options.verbose ? true : false;
    this.init();
    const data = await this.octokit.repos.listReleases({
        owner: this.owner,
        repo: this.repo
    });

    // when remote_path is set expect files to be in stage_dir / remote_path after substitution
    if (this.package_json.binary.remote_path) {
        options.tag_name = this.package_json.binary.remote_path.replace(
            /\{version\}/g,
            this.package_json.version
        );
        this.stage_dir = path.join(this.stage_base_dir, options.tag_name);
    } else {
        // This is here for backwards compatibility for before binary.remote_path support was added in version 1.2.0.
        options.tag_name = this.package_json.version;
        this.stage_dir = this.stage_base_dir;
    }
    const release = data.data.filter(function (element) {
        return element.tag_name === options.tag_name;
    });
    if (release.length === 0) {
        const releaseNew = await this.createRelease(options);
        this.release = releaseNew.data;
        if (this.release.draft) {
            consoleLog(
                'Release ' +
                    this.release.tag_name +
                    ' not found, so a draft release was created. YOU MUST MANUALLY PUBLISH THIS DRAFT WITHIN GITHUB FOR IT TO BE ACCESSIBLE.'
            );
        } else {
            consoleLog(
                'Release ' +
                    release.tag_name +
                    ' not found, so a new release was created and published.'
            );
        }
        return this.uploadAssets(this.release.upload_url);
    } else {
        this.release = release[0];
        return this.uploadAssets();
    }
};

module.exports = NodePreGypGithub;
