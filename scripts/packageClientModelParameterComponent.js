/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

 const childProcess = require('child_process')
 const commander = require('commander')
 const fs = require('fs-extra')
 const mkdirp = require('mkdirp')
 const path = require('path')
 const replace = require('replace-in-file')
 const util = require('../lib/util')
 
 const getComponentDataList = () => {
  return [
    { locale: 'US',
      key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA22Pjefa2d1B1Ms3n3554kpGQK9hgnoGgkKnGOODNB9+pwnXIbUBQ0UPNzfxUnqU16++y3JAbmDpLKswlioRrCY8ZX0uhnotU1ZfqtNd48MEPg/DqJGU37XDxa2lxSoUQq3ppGUm6j384Ma90WEAW05ZIwfe9fu1AUpO5RRoad79LG5C+Ol2HbIQQga5YJjpFuAM5KHqbXkrYZfoDOOEAoDiV4YkmZpmsrntB45LoX0eFaQAMkd7wSujzJ261jSRmc5fBpWni3DCWjeVMqYhv40tNAjtPqwwqXEG2p3QO3wlT5LLW6mIw/SXSgecW/fzcA7gKwMsoEIumN13j21WH8wIDAQAB',
      id: 'cchgndhfgmkkfmhjhmdenpgdbcdjfmgh' },
    { locale: 'GB',
      key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoo+aDr4xxpKJQjgiuN/YDRJA9U5r/oTCgCRjxUBzu+LShtxyfue77RQY+xu0PVZpTznvbR4NLs3jBHiIGDHTzXOFMjO5Pn+8DNKtvNAGjBHoJUvIx6h+fK7++m8IW1RlEd8U1rrjzdfPSh2akzqCY3mM7yk4SXFeN5F+1uFdX9ZJTMWme1gvH4YDziJSjr42AKphTihlFQzddGqgfTdJaTbY7ka6rkdub5w46lle5xw2VNChVhhybnOKSZ+vXAw2yeYUzfik2PZaqAwlrxx6U3AHgv612rcZbHd1SnnTeBm2CWeaAwqa/JCiyXswWi+wHnEppiHSb4UPLHq9elTQRwIDAQAB', 
      id: 'oldkbaailkiinmopalbhaidpjdndifpa' }
  ]
 }
 
 const stageFiles = (locale, version, outputDir) => {
   // Copy resources and manifest file to outputDir.
   // Copy resource files
   const resourceDir = path.join(path.resolve(), 'build', 'client-model-parameters', 'resources', locale, '/')
   console.log('copy dir:', resourceDir, ' to:', outputDir)
   fs.copySync(resourceDir, outputDir)
 
   // Fix up the manifest version
   const originalManifest = getOriginalManifest(locale)
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
 
 const generateManifestFile = (componentData) => {
   const manifestFile = getOriginalManifest(componentData.locale)
   const manifestContent = {
     description: 'Brave Client Model Parameters Component',
     key: componentData.key,
     manifest_version: 2,
     name: 'Brave Client Model Parameters',
     version: '0.0.0'
   }
   fs.writeFileSync(manifestFile, JSON.stringify(manifestContent))
 }
 
 const generateManifestFiles = () => {
   getComponentDataList().forEach(generateManifestFile)
 }
 
 const getManifestsDir = () => {
   const targetResourceDir = path.join(path.resolve(), 'build', 'client-model-parameters', 'manifiest-files')
   mkdirp.sync(targetResourceDir)
   return targetResourceDir
 }
 
 const getOriginalManifest = (locale) => {
   return path.join(getManifestsDir(), `${locale}-manifest.json`)
 }
 
 const generateCRXFile = (binary, endpoint, region, keyDir, componentData) => {
   const originalManifest = getOriginalManifest(componentData.locale)
   const locale = componentData.locale
   const rootBuildDir = path.join(path.resolve(), 'build', 'client-model-parameters')
   const stagingDir = path.join(rootBuildDir, 'staging', locale)
   const crxOutputDir = path.join(rootBuildDir, 'output')
   mkdirp.sync(stagingDir)
   mkdirp.sync(crxOutputDir)
   util.getNextVersion(endpoint, region, componentData.id).then((version) => {
     const crxFile = path.join(crxOutputDir, `client-model-parameters-${locale}.crx`)
     const privateKeyFile = path.join(keyDir, `client-model-parameters-${locale}.pem`)
     stageFiles(locale, version, stagingDir)
     util.generateCRXFile(binary, crxFile, privateKeyFile, stagingDir)
     console.log(`Generated ${crxFile} with version number ${version}`)
   })
 }
 
 util.installErrorHandlers()
 
 commander
   .option('-b, --binary <binary>', 'Path to the Chromium based executable to use to generate the CRX file')
   .option('-d, --keys-directory <dir>', 'directory containing private keys for signing crx files')
   .option('-e, --endpoint <endpoint>', 'DynamoDB endpoint to connect to', '')// If setup locally, use http://localhost:8000
   .option('-r, --region <region>', 'The AWS region to use', 'us-east-2')
   .parse(process.argv)
 
 let keyDir = ''
 if (fs.existsSync(commander.keysDirectory)) {
   keyDir = commander.keysDirectory
 } else {
   throw new Error('Missing or invalid private key directory')
 }
 
 if (!commander.binary) {
   throw new Error('Missing Chromium binary: --binary')
 }
 
 util.createTableIfNotExists(commander.endpoint, commander.region).then(() => {
   generateManifestFiles()
   getComponentDataList().forEach(generateCRXFile.bind(null, commander.binary, commander.endpoint, commander.region, keyDir))
 })
