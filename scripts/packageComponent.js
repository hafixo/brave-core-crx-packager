/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Example usage:
//  npm run package-ad-block -- --binary "/Applications/Google\\ Chrome\\ Canary.app/Contents/MacOS/Google\\ Chrome\\ Canary" --key-file path/to/ad-block-updater.pem

const childProcess = require('child_process')
const commander = require('commander')
const fs = require('fs-extra')
const mkdirp = require('mkdirp')
const path = require('path')
const replace = require('replace-in-file')
const util = require('../lib/util')

const stageFiles = (componentType, datFile, version, outputDir) => {
  let datFileName
  if (componentNeedsStraightCopyFromUnpackedDir(componentType)) {
    const originalDir = getManifestsDirByComponentType(componentType)
    console.log('Copy dir:', originalDir, ' to:', outputDir)
    fs.copySync(originalDir, outputDir)
  } else {
    const parsedDatFile = path.parse(datFile)
    const datFileBase = parsedDatFile.base
    datFileName = getNormalizedDATFileName(parsedDatFile.name)
    const datFileVersion = getDATFileVersionByComponentType(componentType)
    const outputDatDir = path.join(outputDir, datFileVersion)
    const outputDatFile = path.join(outputDatDir, datFileBase)
    mkdirp.sync(outputDatDir)
    console.log('copy dat file: ', datFile, ' to: ', outputDatFile)
    fs.copyFileSync(datFile, outputDatFile)
  }

  // Fix up the manifest version
  const originalManifest = getOriginalManifest(componentType, datFileName)
  const outputManifest = path.join(outputDir, 'manifest.json')
  console.log('copy manifest file: ', originalManifest, ' to: ', outputManifest)
  const replaceOptions = {
    files: outputManifest,
    from: /0\.0\.0/,
    to: version
  }
  fs.copyFileSync(originalManifest, outputManifest)
  replace.sync(replaceOptions)
}

const componentNeedsStraightCopyFromUnpackedDir = (componentType) => {
  switch (componentType) {
    case 'ethereum-remote-client':
      return true
    default:
      return false
  }
}

const getDATFileVersionByComponentType = (componentType) => {
  switch (componentType) {
    case 'ethereum-remote-client':
      return '0'
    case 'https-everywhere-updater':
      return '6.0'
    case 'local-data-files-updater':
      return '1'
    case 'speedreader-updater':
      return JSON.parse(fs.readFileSync(
        path.join(
          'node_modules',
          'speedreader',
          'data',
          'speedreader-updater-manifest.json')).toString())['data_file_version'];
    default:
      throw new Error('Unrecognized component extension type: ' + componentType)
  }
}

const generateManifestFilesByComponentType = (componentType) => {
  switch (componentType) {
    case 'ethereum-remote-client':
      // Provides its own manifest file
      break
    case 'https-everywhere-updater':
    case 'local-data-files-updater':
      // TODO(emerick): Make these work like ad-block (i.e., update
      // the corresponding repos with a script to generate the
      // manifest and then call that script here)
      break
    case 'speedreader-updater':
      // Provides its own manifest file
      break
    default:
      throw new Error('Unrecognized component extension type: ' + componentType)
  }
}

const getManifestsDirByComponentType = (componentType) => {
  switch (componentType) {
    case 'ethereum-remote-client':
      return path.join('node_modules', 'ethereum-remote-client')
    case 'https-everywhere-updater':
    case 'local-data-files-updater':
      // TODO(emerick): Make these work like ad-block
      return path.join('manifests', componentType)
    case 'speedreader-updater':
      return path.join('node_modules', 'speedreader', 'data')
    default:
      throw new Error('Unrecognized component extension type: ' + componentType)
  }
}

const getNormalizedDATFileName = (datFileName) =>
  datFileName === 'ABPFilterParserData' ||
  datFileName === 'httpse.leveldb' ||
  datFileName === 'ReferrerWhitelist' ||
  datFileName === 'ExtensionWhitelist' ||
  datFileName === 'Greaselion' ||
  datFileName === 'AutoplayWhitelist' ? 'default' : datFileName

const getOriginalManifest = (componentType, datFileName) => {
  return path.join(getManifestsDirByComponentType(componentType), datFileName ? `${datFileName}-manifest.json` : 'manifest.json')
}
const getDATFileListByComponentType = (componentType) => {
  switch (componentType) {
    case 'ethereum-remote-client':
      return ['']
    case 'https-everywhere-updater':
      return path.join('node_modules', 'https-everywhere-builder', 'out', 'httpse.leveldb.zip').split()
    case 'local-data-files-updater':
      return [path.join('node_modules', 'autoplay-whitelist', 'data', 'AutoplayWhitelist.dat'),
        path.join('node_modules', 'extension-whitelist', 'data', 'ExtensionWhitelist.dat'),
        path.join('node_modules', 'brave-site-specific-scripts', 'Greaselion.json'),
        path.join('node_modules', 'referrer-whitelist', 'data', 'ReferrerWhitelist.json')]
    case 'speedreader-updater':
      return path.join('node_modules', 'speedreader', 'data', 'speedreader-updater.dat').split()
    default:
      throw new Error('Unrecognized component extension type: ' + componentType)
  }
}

const processDATFile = (binary, endpoint, region, componentType, key, datFile) => {
  const datFileName = getNormalizedDATFileName(path.parse(datFile).name)
  const originalManifest = getOriginalManifest(componentType, datFileName)
  const parsedManifest = util.parseManifest(originalManifest)
  const id = util.getIDFromBase64PublicKey(parsedManifest.key)

  util.getNextVersion(endpoint, region, id).then((version) => {
    const stagingDir = path.join('build', componentType, datFileName)
    const crxOutputDir = path.join('build', componentType)
    const crxFile = path.join(crxOutputDir, datFileName ? `${componentType}-${datFileName}.crx` : `${componentType}.crx`)
    const privateKeyFile = !fs.lstatSync(key).isDirectory() ? key : path.join(key, datFileName ? `${componentType}-${datFileName}.pem` : `${componentType}.pem`)
    stageFiles(componentType, datFile, version, stagingDir)
    util.generateCRXFile(binary, crxFile, privateKeyFile, stagingDir)
    console.log(`Generated ${crxFile} with version number ${version}`)
  })
}

util.installErrorHandlers()

commander
  .option('-b, --binary <binary>', 'Path to the Chromium based executable to use to generate the CRX file')
  .option('-d, --keys-directory <dir>', 'directory containing private keys for signing crx files')
  .option('-f, --key-file <file>', 'private key file for signing crx', 'key.pem')
  .option('-t, --type <type>', 'component extension type', /^(https-everywhere-updater|local-data-files-updater|ethereum-remote-client|speedreader-updater)$/i)
  .option('-e, --endpoint <endpoint>', 'DynamoDB endpoint to connect to', '')// If setup locally, use http://localhost:8000
  .option('-r, --region <region>', 'The AWS region to use', 'us-east-2')
  .parse(process.argv)

let keyParam = ''

if (fs.existsSync(commander.keyFile)) {
  keyParam = commander.keyFile
} else if (fs.existsSync(commander.keysDirectory)) {
  keyParam = commander.keysDirectory
} else {
  throw new Error('Missing or invalid private key file/directory')
}

if (!commander.binary) {
  throw new Error('Missing Chromium binary: --binary')
}

util.createTableIfNotExists(commander.endpoint, commander.region).then(() => {
  generateManifestFilesByComponentType(commander.type)
  getDATFileListByComponentType(commander.type)
    .forEach(processDATFile.bind(null, commander.binary, commander.endpoint, commander.region, commander.type, keyParam))
})
