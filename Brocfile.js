var concat     = require('broccoli-sourcemap-concat');
var Funnel     = require('broccoli-funnel');
var mergeTrees = require('broccoli-merge-trees');
var compileES6 = require('broccoli-es6modules');
var jshintTree = require('broccoli-jshint');
var replace    = require('broccoli-string-replace');
var gitVersion = require('git-repo-version');

// extract version from git
// note: remove leading `v` (since by default our tags use a `v` prefix)
var version = gitVersion().replace(/^v/, '');

var packages = [
  {
    name: 'orbit-firebase',
    include: [/orbit-firebase\/lib\/cache-utils.js/,
              /orbit-firebase\/lib\/array-utils.js/,
              /orbit-firebase\/lib\/object-utils.js/,
              /orbit-firebase\/lib\/operation-utils.js/,
              /orbit-firebase\/lib\/schema-utils.js/,
              /orbit-firebase\/cache-source.js/,
              /orbit-firebase\/operation-sequencer.js/,
              /orbit-firebase\/firebase-client.js/,
              /orbit-firebase\/firebase-connector.js/,
              /orbit-firebase\/firebase-serializer.js/,
              /orbit-firebase\/firebase-transformer.js/,
              /orbit-firebase\/firebase-requester.js/,
              /orbit-firebase\/firebase-source.js/,
              /orbit-firebase\/firebase-listener.js/,
              /orbit-firebase\/transformations.js/,
              /orbit-firebase\/subscriptions\/subscription.js/,
              /orbit-firebase\/subscriptions\/record-subscription.js/,
              /orbit-firebase\/subscriptions\/attribute-subscription.js/,
              /orbit-firebase\/subscriptions\/has-one-subscription.js/,
              /orbit-firebase\/subscriptions\/has-many-subscription.js/,
              /orbit-firebase\/subscriptions\/options.js/,
              /orbit-firebase\/operation-decomposer.js/,
              /orbit-firebase\/operation-matcher.js/,
              /orbit-firebase\/transformers\/add-record.js/,
              /orbit-firebase\/transformers\/remove-record.js/,
              /orbit-firebase\/transformers\/replace-attribute.js/,
              /orbit-firebase\/transformers\/add-to-has-many.js/,
              /orbit-firebase\/transformers\/add-to-has-one.js/,
              /orbit-firebase\/transformers\/remove-has-one.js/,
              /orbit-firebase\/transformers\/replace-has-many.js/,
              /orbit-firebase\/transformers\/remove-from-has-many.js/,
              /orbit-firebase\/transformers\/update-meta.js/]
  }
];

var loader = new Funnel('bower_components', {
  srcDir: 'loader',
  files: ['loader.js'],
  destDir: '/assets/'
});

var globalizedLoader = new Funnel('build-support', {
  srcDir: '/',
  files: ['globalized-loader.js'],
  destDir: '/assets/'
});

var generatedBowerConfig = new Funnel('build-support', {
  srcDir: '/',
  destDir: '/',
  files: ['bower.json']
});

generatedBowerConfig = replace(generatedBowerConfig, {
  files: ['bower.json'],
  pattern: {
    match: /VERSION_PLACEHOLDER/,
    replacement: function() {
      return version;
    }
  }
});

var tests = new Funnel('test', {
  srcDir: '/tests',
  include: [/.js$/],
  destDir: '/tests'
});

var buildExtras = new Funnel('build-support', {
  srcDir: '/',
  destDir: '/',
  files: ['README.md', 'LICENSE']
});

var lib = {};
var main = {};
var globalized = {};

packages.forEach(function(package) {
  lib[package.name] = new Funnel('lib', {
    srcDir: '/',
    include: package.include,
    exclude: package.exclude || [],
    destDir: '/'
  });

  main[package.name] = mergeTrees([ lib[package.name] ]);
  main[package.name] = concat(new compileES6(main[package.name]), {
    inputFiles: ['**/*.js'],
    outputFile: '/' + package.name + '.amd.js'
  });

  var support = new Funnel('build-support', {
    srcDir: '/',
    files: ['iife-start.js', 'globalize-' + package.name + '.js', 'iife-stop.js'],
    destDir: '/'
  });

  var loaderTree = (package.name === 'orbit' ? loader : globalizedLoader);
  var loaderFile = (package.name === 'orbit' ? 'loader.js' : 'globalized-loader.js');

  globalized[package.name] = concat(mergeTrees([loaderTree, main[package.name], support]), {
    inputFiles: ['iife-start.js', 'assets/' + loaderFile, package.name + '.amd.js', 'globalize-' + package.name + '.js', 'iife-stop.js'],
    outputFile: '/' + package.name + '.js'
  });
});

var allLib = mergeTrees(Object.keys(lib).map(function(package) {
  return lib[package];
}));
var allMain = mergeTrees(Object.keys(main).map(function(package) {
  return main[package];
}));
var allGlobalized = mergeTrees(Object.keys(globalized).map(function(package) {
  return globalized[package];
}));

var jshintLib = jshintTree(allLib);
var jshintTest = jshintTree(tests);

var mainWithTests = mergeTrees([allLib, tests, jshintLib, jshintTest]);
mainWithTests = concat(new compileES6(mainWithTests), {
  inputFiles: ['**/*.js'],
  outputFile: '/assets/tests.amd.js'
});


mainWithTests = replace(mainWithTests, {
  files: "/assets/tests.amd.js",
  patterns: [
    {match: /%FIREBASE_URL/g, replacement: process.env.ORBIT_FIREBASE_FIREBASE_URL},
    {match: /%FIREBASE_SECRET/g, replacement: process.env.ORBIT_FIREBASE_FIREBASE_SECRET},
  ]
});

var vendor = concat('bower_components', {
  inputFiles: [
    'jquery/dist/jquery.js',
    'rsvp/rsvp.js',
    'firebase/firebase-debug.js',
    'firebase-token-generator/dist/firebase-token-generator.js',
    'orbit.js/orbit.amd.js',
    'orbit.js/orbit-common.amd.js'],
  outputFile: '/assets/vendor.js'
});

var qunit = new Funnel('bower_components', {
  srcDir: '/qunit/qunit',
  files: ['qunit.js', 'qunit.css'],
  destDir: '/assets'
});

var testSupport = concat('test', {
  inputFiles: ['../test/test-support/sinon.js', '../test/test-support/test-shims.js', '../test/test-support/test-loader.js'],
  outputFile: '/assets/test-support.js'
});

var testIndex = new Funnel('test', {
  srcDir: '/',
  files: ['index.html'],
  destDir: '/tests'
});

module.exports = mergeTrees([loader, globalizedLoader, allMain,
  allGlobalized, mainWithTests, vendor, qunit, testSupport, testIndex,
  generatedBowerConfig, buildExtras]);
