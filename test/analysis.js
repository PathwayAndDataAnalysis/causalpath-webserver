const sinon = require('sinon');
const fs = require('../lib/fs-promisified');
const Analysis = require('../lib/analysis');
const Util = require('../lib/util');
const promisifyAll = require('util-promisifyall');
const { fs: memFs, vol } = require('memfs');
const mockFs = promisifyAll(memFs);
const path = require('path');

const fsOpPrefixes = ['readdir', 'writeFile', 'readdir', 'lstat', 'exists', 'mkdir', 'readFile'];

const fsWrappers = {};

fsOpPrefixes.forEach(opPrefix => {
  const opNames = [opPrefix, `${opPrefix}Sync`, `${opPrefix}Async`];
  opNames.forEach(opName => {
    fsWrappers[opName] = (pathStr, ...args) => {
      const newPath = path.join('/', pathStr);
      return mockFs[opName](newPath, ...args);
    }
  });
});

QUnit.module('analysis', hooks => {
  hooks.beforeEach(() => {
    this.fsStubs = {};
    for ( const opName in fsWrappers ) {
      const stub = sinon.stub(fs, opName);
      stub.callsFake(fsWrappers[opName]);
      this.fsStubs[opName] = stub;
    }
  });

  hooks.afterEach(() => {
    for ( opName in fsWrappers ) {
      this.fsStubs[opName].restore();
    }
  });

  QUnit.test('calculateFilePaths', async assert => {
    const roomPath = 'room';
    const folder1Path = path.join(roomPath, 'folder1');
    const folder2Path = path.join(roomPath, 'folder2');
    const file1Path = path.join(folder1Path, 'file1.txt');
    const file2Path = path.join(folder1Path, 'file2.txt');
    const file3Path = path.join(folder2Path, 'file1.txt');
    const file4Path = path.join(folder2Path, 'file2.txt');

    const dirPaths = [roomPath, folder1Path, folder2Path];
    const filePaths = [file1Path, file2Path, file3Path, file4Path];

    dirPaths.forEach(fs.mkdirSync);
    filePaths.forEach(filePath => fs.writeFileSync(filePath, ''));

    const calculatedPaths = await Analysis.calculateFilePaths(roomPath);
    const expectedPaths = filePaths;

    calculatedPaths.sort();
    expectedPaths.sort();

    assert.deepEqual(calculatedPaths, expectedPaths);
  });

  QUnit.test('downloadRequest', async assert => {
    const roomPath = 'room';
    const zipPath = `${roomPath}.zip`;
    const zipContent = 'zip content';
    const zipContentStub = sinon.stub(Util, "zipContent");
    zipContentStub.callsFake(() => fs.writeFileSync(zipPath, zipContent));

    await Analysis.downloadRequest(roomPath);

    assert.equal(zipContentStub.calledOnce, true);
    assert.equal(zipContentStub.calledWith(roomPath), true);
    assert.equal(fs.readFileSync(zipPath), zipContent);
    zipContentStub.restore();
  });

  QUnit.test('analysisDir', async assert => {
    const stub = sinon.stub(Analysis, "analyzeFiles");
    stub.callsFake((dirPath) => Promise.resolve(path.join('/', dirPath)));

    const files = [
      { name: "file1.txt", content: "file1 content" },
      { name: "file2.txt", content: "file2 content" },
      { name: "file3.txt", content: "file3 content" }
    ];

    const roomPath = '/';
    await Analysis.analysisDir(roomPath, files);
    for (const file of files) {
      assert.equal(fs.existsSync(file.name), true);
      assert.equal(fs.readFileSync(file.name), file.content);
    }

    assert.equal(stub.calledOnce, true);
    assert.equal(stub.calledWith(roomPath), true);
    stub.restore();
  });

  QUnit.test('analysisZip', async assert => {
    const analyzeFilesStub = sinon.stub(Analysis, "analyzeFiles");
    analyzeFilesStub.callsFake((dirPath) => Promise.resolve(path.join('/', dirPath)));

    const unzipStub = sinon.stub(Util, "unzip");

    const roomPath = 'room';
    const content = '';
    const zipPath = `${roomPath}.zip`;

    await Analysis.analysisZip(roomPath, content);

    assert.equal(analyzeFilesStub.calledOnce, true);
    assert.equal(analyzeFilesStub.calledWith(roomPath), true);
    assert.equal(unzipStub.calledOnce, true);
  });
});
