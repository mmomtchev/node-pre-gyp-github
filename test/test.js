'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
chai.use(chaiAsPromised);
let fs = require('fs');
const Index = require('../index.js');
const index = new Index();
const stage_dir = index.stage_dir;
const {Octokit} = require('@octokit/rest');
const octokit = new Octokit({auth: 'secret'});
const sinon = require('sinon');
const reset_index = function (index_string_ref) {
    delete require.cache[require.resolve(index_string_ref)];
    return require(index_string_ref);
};

const sandbox = sinon.createSandbox();

const reset_mocks = function () {
    sandbox.restore();
    process.env.NODE_PRE_GYP_GITHUB_TOKEN = 'secret';
    fs = reset_index('fs');
    fs.readFileSync = function () {
        return '{"name":"test","version":"0.0.1","repository": {"url":"git+https://github.com/test/test.git"},"binary":{"host":"https://github.com/test/test/releases/download/","remote_path":"{version}"}}';
    };
    index.stage_dir = stage_dir;
    Index.prototype.octokit = function () {
        return octokit;
    };
    sandbox.stub(octokit.repos, 'listReleases').callsFake(function () {
        return Promise.resolve({data: [{tag_name: '0.0.0', assets: [{name: 'filename'}]}]});
    });
    sandbox.stub(octokit.repos, 'createRelease').callsFake(function () {
        return Promise.resolve({data: {tag_name: '0.0.1', draft: true, assets: [{}]}});
    });
    sandbox.stub(octokit.repos, 'uploadReleaseAsset').callsFake(function () {
        return Promise.resolve();
    });
    sandbox.stub(octokit.repos, 'listReleaseAssets').callsFake(function () {
        return Promise.resolve({
            data: [
                {state: 'uploaded', id: 1},
                {state: 'starter', id: 2}
            ]
        });
    });
    sandbox.stub(octokit.repos, 'deleteReleaseAsset').callsFake(function () {
        return Promise.reject();
    });
};

describe('Publishes packages to GitHub Releases', function () {
    describe('Publishes without an error under all options', function () {
        let log, err;
        beforeEach(() => {
            log = console.log;
            err = console.error;
            reset_mocks();
            fs.promises.readdir = function () {
                return Promise.resolve(['filename']);
            };
            fs.promises.readFile = function () {
                return {};
            };
            console.log = function () {};
            console.error = function () {};
        });
        afterEach(() => {
            console.log = log;
            console.error = err;
        });
        describe('should publish without error in all scenarios', function () {
            it('when a release already exists', () => {
                const tests = [];

                tests.push(expect(index.publish()).to.be.fulfilled);
                tests.push(expect(index.publish({draft: false, verbose: false})).to.be.fulfilled);
                tests.push(expect(index.publish({draft: false, verbose: true})).to.be.fulfilled);
                tests.push(expect(index.publish({draft: true, verbose: false})).to.be.fulfilled);
                tests.push(expect(index.publish({draft: true, verbose: true})).to.be.fulfilled);

                return Promise.all(tests);
            });

            it('when a release does not already exist', () => {
                const tests = [];

                octokit.repos.listReleases = function () {
                    return Promise.resolve({data: []});
                };
                octokit.repos.createRelease = function () {
                    return Promise.resolve({data: {draft: false}});
                };

                tests.push(expect(index.publish()).to.be.fulfilled);
                tests.push(expect(index.publish({draft: false, verbose: false})).to.be.fulfilled);
                tests.push(expect(index.publish({draft: false, verbose: true})).to.be.fulfilled);

                octokit.repos.createRelease = function () {
                    return Promise.resolve({data: {draft: true}});
                };

                tests.push(expect(index.publish({draft: true, verbose: false})).to.be.fulfilled);
                tests.push(expect(index.publish({draft: true, verbose: true})).to.be.fulfilled);

                fs.readFileSync = function () {
                    return '{"version":"0.0.1","repository": {"url":"git+https://github.com/test/test.git"},"binary":{"host":"https://github.com/test/test/releases/download/","remote_path":"{version}"}}';
                };

                tests.push(expect(index.publish()).to.be.fulfilled);

                return Promise.all(tests);
            });
        });
    });

    describe('Throws an error when node-pre-gyp-github is not configured properly', function () {
        let log, err;
        beforeEach(() => {
            log = console.log;
            err = console.error;
            reset_mocks();
            console.log = function () {};
            console.error = function () {};
        });
        afterEach(() => {
            console.log = log;
            console.error = err;
        });

        it('should throw an error when missing repository.url in package.json', function () {
            const options = {draft: true, verbose: false};
            reset_mocks();
            fs.readFileSync = function () {
                return '{}';
            };
            return expect(index.publish(options)).to.be.rejectedWith(
                'Missing repository.url in package.json'
            );
        });

        it('should throw an error when a correctly formatted GitHub repository.url is not found in package.json', function () {
            const options = {draft: true, verbose: false};
            reset_mocks();
            fs.readFileSync = function () {
                return '{"repository": {"url":"bad_format_url"}}';
            };
            return expect(index.publish(options)).to.be.rejectedWith(
                'A correctly formatted GitHub repository.url was not found within package.json'
            );
        });

        it('should throw an error when missing binary.host in package.json', function () {
            const options = {draft: true, verbose: false};
            reset_mocks();
            fs.readFileSync = function () {
                return '{"repository": {"url":"git+https://github.com/test/test.git"}}';
            };
            return expect(index.publish(options)).to.be.rejectedWith(
                'Missing binary.host in package.json'
            );
        });

        it('should throw an error when binary.host does not begin with the correct url', function () {
            const options = {draft: true, verbose: false};
            reset_mocks();
            fs.readFileSync = function () {
                return '{"repository": {"url":"git+https://github.com/test/test.git"},"binary":{"host":"bad_format_binary"}}';
            };
            return expect(index.publish(options)).to.be.rejectedWith(
                /^binary.host in package.json should begin with:/i
            );
        });

        it('should throw an error when the NODE_PRE_GYP_GITHUB_TOKEN environment variable is not found', function () {
            const options = {draft: true, verbose: false};
            reset_mocks();
            process.env.NODE_PRE_GYP_GITHUB_TOKEN = '';
            return expect(index.publish(options)).to.be.rejectedWith(
                'NODE_PRE_GYP_GITHUB_TOKEN environment variable not found'
            );
        });

        it('should throw an error when octokit.repos.listReleases returns an error', function () {
            const options = {draft: true, verbose: false};
            reset_mocks();

            octokit.repos.listReleases.restore();
            sandbox.stub(octokit.repos, 'listReleases').callsFake(function () {
                return Promise.reject(new Error('listReleases error'));
            });

            return expect(index.publish(options)).to.be.rejectedWith('listReleases error');
        });

        it('should throw an error when octokit.repos.createRelease returns an error', function () {
            const options = {draft: true, verbose: false};
            reset_mocks();
            octokit.repos.listReleases = function () {
                return Promise.resolve({data: []});
            };
            octokit.repos.createRelease = function () {
                return Promise.reject(new Error('createRelease error'));
            };
            return expect(index.publish(options)).to.be.rejectedWith('createRelease error');
        });

        it('should throw an error when the stage directory structure is missing', function () {
            const options = {draft: true, verbose: false};
            reset_mocks();
            fs.promises.readdir = function () {
                return Promise.reject(new Error('readdir Error'));
            };
            return expect(index.publish(options)).to.be.rejectedWith('readdir Error');
        });

        it('should throw an error when there are no files found within the stage directory', function () {
            const options = {draft: true, verbose: false};
            reset_mocks();
            fs.promises.readdir = function () {
                return Promise.resolve([]);
            };
            return expect(index.publish(options)).to.be.rejectedWith(
                /^No files found within the stage directory:/i
            );
        });

        it('should throw an error when a staged file already exists in the current release', function () {
            const options = {draft: true, verbose: false};
            reset_mocks();
            fs.promises.readdir = function () {
                return Promise.resolve(['filename']);
            };
            octokit.repos.listReleases = function () {
                return Promise.resolve({data: [{tag_name: '0.0.1', assets: [{name: 'filename'}]}]});
            };
            return expect(index.publish(options)).to.be.rejectedWith(
                /^Staged file .* found but it already exists in release .*. If you would like to replace it, you must first manually delete it within GitHub./i
            );
        });

        it('should throw an error when github.releases.uploadAsset returns an error 3 times', function () {
            const options = {draft: true, verbose: false};
            reset_mocks();
            fs.promises.readdir = function () {
                return Promise.resolve(['filename']);
            };
            let counter = 0;
            let deleted = [];
            octokit.repos.uploadReleaseAsset = function () {
                counter++;
                return Promise.reject(new Error('uploadAsset error'));
            };
            octokit.repos.deleteReleaseAsset = function (asset) {
                deleted.push(asset.asset_id);
                return Promise.resolve();
            };
            return expect(index.publish(options))
                .to.be.rejectedWith('uploadAsset error')
                .then(() => {
                    expect(counter).to.equal(3);
                    expect(deleted).to.deep.equal([2, 2, 2]);
                });
        });

        it('should work correctly when deleting partial assets fails', function () {
            const options = {draft: true, verbose: false};
            reset_mocks();
            fs.promises.readdir = function () {
                return Promise.resolve(['filename']);
            };
            let counter = 0;
            octokit.repos.uploadReleaseAsset = function () {
                counter++;
                return Promise.reject(new Error('uploadAsset error'));
            };
            return expect(index.publish(options))
                .to.be.rejectedWith('uploadAsset error')
                .then(() => {
                    expect(counter).to.equal(3);
                });
        });
    });

    describe('Verify backwards compatible with any breaking changes made within the same MINOR version.', function () {
        it("should publish even when package.json's binary.remote_path property is not provided and instead the version is hard coded within binary.host", function () {
            const options = {draft: false, verbose: false};
            reset_mocks();
            fs.readFileSync = function () {
                return '{"name":"test","version":"0.0.1","repository": {"url":"git+https://github.com/test/test.git"},"binary":{"host":"https://github.com/test/test/releases/download/0.0.1"}}';
            };
            fs.readdir = function () {
                return Promise.reoslve(['filename']);
            };
            octokit.reposcreateRelease = function () {
                return Promise.resolve({data: {tag_name: '0.0.1', draft: false, assets: [{}]}});
            };
            return expect(index.publish(options)).to.be.fulfilled;
        });
    });
});
