import Orbit from 'orbit/main';
import { uuid } from 'orbit/lib/uuid';
import Schema from 'orbit-common/schema';
import Source from 'orbit-common/source';
import FirebaseSource from 'orbit-firebase/firebase-source';
import FirebaseClient from 'orbit-firebase/firebase-client';
import { Promise, all, allSettled, hash, denodeify,resolve, on, defer, map } from 'rsvp';
import { isArray, clone } from 'orbit/lib/objects';
import { spread } from 'orbit/lib/functions';
import { nextEventPromise, captureDidTransforms, wait, prepareFirebaseClient } from 'tests/test-helper';

var schema,
    source,
    firebaseRef,
    firebaseClient;

///////////////////////////////////////////////////////////////////////////////

module("OC - FirebaseSource", {
  setup: function() {
    Orbit.Promise = Promise;
    Orbit.all = all;
    Orbit.allSettled = allSettled;
    Orbit.resolve = resolve;
    Orbit.map = map;

    schema = new Schema({
      modelDefaults: {
        keys: {
          'id': {primaryKey: true, defaultValue: uuid}
        }
      },
      models: {
        planet: {
          attributes: {
            name: {type: 'string'},
            classification: {type: 'string'}
          },
          links: {
            moons: {type: 'hasMany', model: 'moon', inverse: 'planet'}
          }
        },
        moon: {
          attributes: {
            name: {type: 'string'},
            isProtected: {type: 'boolean'}
          },
          links: {
            planet: {type: 'hasOne', model: 'planet', inverse: 'moons'}
          }
        }
      }
    });

    stop();
    prepareFirebaseClient().then(function(preparedFirebaseClient){
      firebaseClient = preparedFirebaseClient;
      firebaseRef = firebaseClient.firebaseRef;
      source = new FirebaseSource(schema, {firebaseRef: firebaseRef});

      start();
    });
  },

  teardown: function() {
    schema = null;
    source = null;

  }
});

test("#add - can add record", function(){
  expect(12);
  var planetDetails = {name: 'Jupiter', classification: 'gas giant'};

  stop();

  source.add('planet', clone(planetDetails)).then(function(planet){
    start();
    ok(planet.id, "orbit id should be defined");
    equal(planetDetails.name, planet.name, "cache planet name");
    equal(planetDetails.classification, planet.classification, "cache planet classification");
    stop();
    var path = ['planet', planet.id].join("/");

    all([
      firebaseClient.valueAt(path),
      firebaseClient.valueAt('operation')

    ]).then(spread(function(storedPlanet, operations){
      start();

      ok(storedPlanet.id, 'add planet id');
      equal(planetDetails.name, storedPlanet.name, "store planet name");
      equal(planetDetails.classification, storedPlanet.classification, "store planet classification");

      var operationKey = Object.keys(operations)[0];
      var operation = operations[operationKey];
      equal(operation.op, 'add', "op included in operation");
      equal(operation.path, 'planet/' + storedPlanet.id, "path included in operation");
      equal(operation.value.name, planetDetails.name, "name included in operation");
      equal(operation.value.classification, planetDetails.classification, "classification included in operation");
      equal(operation.version, 0, "version included in operation");
      ok(/active:\d+/.test(operation.jobStatus), "job status included in operation");
    }));
  });
});

test("#patch - can patch records", function() {
  expect(8);
  stop();
  var _this = this;

  var planet;
  var planetDetails = {name: 'Jupiter', classification: 'gas giant'};
  source.add('planet', planetDetails)
  .then(function(addedPlanet){
    planet = addedPlanet;
    return source.patch('planet', {id: addedPlanet.id}, 'classification', 'iceball');

  })
  .then(function(){
    return firebaseRef.child('planet/' + planet.id + '/classification').once('value', function(snapshot){
      start();
      equal(snapshot.val(), 'iceball');
      equal(source.retrieve(["planet", planet.id]).classification, 'iceball');
      stop();
    });

  }).then(function(){
    firebaseClient.valueAt('operation').then(function(operations){
      start();

      var operationKey = Object.keys(operations)[0];
      var operation = operations[operationKey];
      equal(operation.op, 'add', "op included in operation");
      equal(operation.path, 'planet/' + planet.id, "path included in operation");
      equal(operation.value.name, planetDetails.name, "name included in operation");
      equal(operation.value.classification, planetDetails.classification, "classification included in operation");
      equal(operation.version, 0, "version included in operation");
      ok(/active:\d+/.test(operation.jobStatus), "job status included in operation");
    });

  });
});

test("#remove - can delete records", function() {
  expect(7);
  stop();
  var planetDetails = {name: 'Jupiter', classification: 'gas giant'};
  var planet;

  source.add('planet', planetDetails).then(function(addedPlanet){
    planet = addedPlanet;
    return source.remove('planet', planet.id).then(function(){
      var path = ['planet', planet.id].join("/");

      return firebaseRef.child(path).once('value', function(snapshot){
        start();
        ok(!snapshot.val(), "remove record from firebase");
        ok(!source.retrieve(["planet", planet.id]), "remove record from cache");
        stop();
      });
    });

  }).then(function(){
    firebaseClient.valueAt('operation').then(function(operations){
      start();

      var operationKey = Object.keys(operations)[1];
      var operation = operations[operationKey];
      equal(operation.op, 'remove', "op included in operation");
      equal(operation.path, 'planet/' + planet.id, "path included in operation");
      equal(operation.version, 0, "version included in operation");
      ok(!operation.value, "operation does not include a value");
      ok(/active:\d+/.test(operation.jobStatus), "job status included in operation");
    });

  });
});


test("#find - can find individual records by passing in a single id", function() {
  expect(4);
  stop();
  var planetDetails = {name: 'Jupiter', classification: 'gas giant'};
  source.add('planet', planetDetails).then(function(originalPlanet){
    source.find('planet', planetDetails.id).then(function(foundPlanet){
      start();
      equal(foundPlanet.id, originalPlanet.id, "assign id");
      equal(foundPlanet.name, originalPlanet.name, "assign name");
      equal(foundPlanet.classification, originalPlanet.classification, "assign classification");

      equal(source.retrieve(['planet', originalPlanet.id]).id, originalPlanet.id);
    });
  });
});

test("#find - can find multiple records by passing in many ids", function() {
  expect(2);
  stop();
  var jupiter = {id: 'planet1', name: 'Jupiter', classification: 'gas giant'};
  var saturn = {id: 'planet2', name: 'Saturn', classification: 'something else'};

  all([
    source.add('planet', jupiter),
    source.add('planet', saturn)
  ]).then(function(){
    source.find('planet', [jupiter.id, saturn.id]).then(function(foundPlanets){
      start();

      equal(foundPlanets[0].name, jupiter.name, 'found Jupiter');
      equal(foundPlanets[1].name, saturn.name, 'found Saturn');
    });
  });
});

test("#find - can find all records", function() {
  expect(1);
  stop();

  var planetsPromise = all([
    source.add('planet', {name: 'Jupiter', classification: 'gas giant'}),
    source.add('planet', {name: 'Earth', classification: 'terrestrial'}),
    source.add('planet', {name: 'Saturn', classification: 'gas giant'})
  ]);

  planetsPromise.then(function(){
    source.find('planet').then(function(planets){
      start();
      equal(planets.length, 3, "loaded 3 planets");
    });
  });
});

test("#find - can 'include' relationships", function(){
  stop();

  var jupiter = { id: 'planet1', name: "Jupiter", moons: { 'moon1': true } };
  var europa = { id: 'moon1', name: 'Europa', planet: 'planet1' };

  all([
    source.add('planet', jupiter),
    source.add('moon', europa)
  ])
  .then(function(){
    return source.find('planet', 'planet1', {include: ['moons']});

  })
  .then(function(){
    start();
    var sourceEuropa = source.retrieve(['moon', 'moon1']);
    equal(sourceEuropa.id, europa.id);
  });
});

test("#find - returns empty when no results for find all", function() {
  expect(2);
  stop();

  source.find('planet').then(function(planets){
    start();
    ok(isArray(planets), "returned planets as array");
    equal(planets.length, 0, "no results");
  });
});


test("#addLink - can add to hasMany", function() {
  expect(7);
  stop();

  var titan, saturn, fbTitan, fbSaturn;
  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),
  ])
  .then(function(){
    return source.addLink('planet', saturn.id, 'moons', titan.id);
  })
  .then(function(){
    return all([
      firebaseClient.valueAt('moon/' + titan.id).then(function(titan){ fbTitan = titan; }),
      firebaseClient.valueAt('planet/' + saturn.id).then(function(saturn){ fbSaturn = saturn; }),
    ]);
  })
  .then(function(){
    start();
    ok(fbSaturn.moons[titan.id], "firebase should have added  titan to saturn");
    equal(source.retrieveLink('planet', saturn.id, 'moons'), titan.id, "cache should have added titan to saturn");
    stop();

  }).then(function(){
    firebaseClient.valueAt('operation').then(function(operations){
      start();
      var operationKey = Object.keys(operations)[2];
      var operation = operations[operationKey];
      equal(operation.op, 'add', "op included in operation");
      equal(operation.version, 0, "version included in operation");

      equal(operation.path, 'planet/' + fbSaturn.id + '/__rel/moons/' + fbTitan.id);
      equal(operation.value, true, "operation included value");
      ok(/active:\d+/.test(operation.jobStatus), "job status included in operation");
    });

  });
});

test('#addLink - can set hasOne link', function(){
  expect(7);
  stop();

  var titan, saturn, fbTitan, fbSaturn;

  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),

  ])
  .then(function(){
    return source.addLink('moon', titan.id, 'planet', saturn.id);

  })
  .then(function(){
    return firebaseClient.valueAt('moon/' + titan.id);

  })
  .then(function(fbTitan){
    start();
    equal(fbTitan.planet, saturn.id, "titan is in orbit around saturn");
    equal(source.retrieveLink('moon', titan.id, "planet"), saturn.id, "cache should have added saturn to titan");
    stop();

  }).then(function(){
    firebaseClient.valueAt('operation').then(function(operations){
      start();
      var operationKey = Object.keys(operations)[2];
      var operation = operations[operationKey];
      equal(operation.op, 'replace', "op included in operation");
      equal(operation.version, 0, "version included in operation");

      equal(operation.path, "moon/" + titan.id + "/__rel/planet");
      equal(operation.value, saturn.id, "operation included value");
      ok(/active:\d+/.test(operation.jobStatus), "job status included in operation");
    });

  });
});

test("#removeLink - can remove from a hasMany relationship", function() {
  expect(7);
  stop();

  var titan, saturn, fbTitan, fbSaturn;

  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),
  ])
  .then(function(){
    return source.addLink('planet', saturn.id, 'moons', titan.id);
  })
  .then(function(){
    return source.removeLink('planet', saturn.id, 'moons', titan.id);
  })
  .then(function(){
    return all([
      firebaseClient.valueAt('moon/' + titan.id).then(function(titan){ fbTitan = titan; }),
      firebaseClient.valueAt('planet/' + saturn.id).then(function(saturn){ fbSaturn = saturn; }),
    ]);
  })
  .then(function(){
    start();
    ok(!fbSaturn.moons, "saturn is no longer orbitted by titan");
    equal(source.retrieveLink('planet', saturn.id, 'moons').length, 0, "cache should have removed titan from saturn");
    stop();

  }).then(function(){
    firebaseClient.valueAt('operation').then(function(operations){
      start();
      var operationKey = Object.keys(operations)[2];
      var operation = operations[operationKey];
      equal(operation.op, 'add', "op included in operation");
      equal(operation.version, 0, "version included in operation");

      equal(operation.path, "planet/" + fbSaturn.id + "/__rel/moons/" + fbTitan.id);
      equal(operation.value, true, "operation included value");
      ok(/active:\d+/.test(operation.jobStatus), "job status included in operation");
    });

  });
});

// test("#replaceLink - can update a hasMany relationship with hasOne inverse", function() {
//   expect(4);
//   stop();

//   var titan, saturn, fbTitan, fbSaturn;

//   all([
//     source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn}),
//     source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan}),
//   ])
//   .then(function(){
//     return source.addLink('moon', titan.id, 'planet', saturn.id);
//   })
//   .then(function(){
//     return source.updateLink('planet', saturn.id, 'moons', []);
//   })
//   .then(function(){
//     return all([
//       loadFirebaseValue('moon/' + titan.id).then(function(titan){ fbTitan = titan; }),
//       loadFirebaseValue('planet/' + saturn.id).then(function(saturn){ fbSaturn = saturn; }),
//     ])
//   })
//   .then(function(){
//     start();
//     ok(!fbTitan.planet, "titan has left saturn's orbit");
//     ok(!fbSaturn.moons, "no moons orbiting saturn");

//     equal(source.retrieveLink('planet', saturn.id, 'moons').length, 0, "cache has removed titan from saturn");
//     ok(!source.retrieveLink('moon', titan.id, "planet"), "cache has removed saturn from titan");
//   });
// });

test("#removeLink - can remove a hasOne relationship", function() {
  expect(9);
  stop();

  var titan, saturn, fbTitan, fbSaturn;

  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),
  ])
  .then(function(){
    return source.addLink('moon', titan.id, 'planet', saturn.id);
  })
  .then(function(){
    return source.removeLink('moon', titan.id, 'planet');
  })
  .then(function(){
    return all([
      firebaseClient.valueAt('moon/' + titan.id).then(function(titan){ fbTitan = titan; }),
      firebaseClient.valueAt('planet/' + saturn.id).then(function(saturn){ fbSaturn = saturn; }),
    ]);
  })
  .then(function(){
    start();
    ok(!fbTitan.planetId, "titan has left saturn's orbit");
    ok(!fbSaturn.moonIds, "saturn is no longer orbitted by titan");

    equal(source.retrieveLink('planet', saturn.id, 'moons').length, 0, "cache should have removed titan from saturn");
    ok(!source.retrieveLink('moon', titan.id, "planet"), "cache should have removed saturn from titan");
    stop();

  }).then(function(){
    firebaseClient.valueAt('operation').then(function(operations){
      start();
      var operationKey = Object.keys(operations)[2];
      var operation = operations[operationKey];
      equal(operation.op, 'replace', "op included in operation");

      equal(operation.path, "moon/" + fbTitan.id + "/__rel/planet");
      equal(operation.value, fbSaturn.id, "operation included value");
      equal(operation.version, 0, "version included in operation");
      ok(/active:\d+/.test(operation.jobStatus), "job status included in operation");
    });

  });
});

test("#findLink - can find has-many linked ids", function() {
  expect(1);
  stop();

  var titan, saturn, fbTitan, fbSaturn;

  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),
  ])
  .then(function(){
    return source.addLink('planet', saturn.id, 'moons', titan.id);
  })
  .then(function(){
    source.findLink('planet', saturn.id, 'moons').then(function(moonIds){
      start();
      equal(moonIds.length, 1);
    });
  });
});

test("#findLinked - can find has-many linked records", function() {
  expect(1);
  stop();

  var titan, saturn, fbTitan, fbSaturn;

  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),
  ])
  .then(function(){
    return source.addLink('planet', saturn.id, 'moons', titan.id);
  })
  .then(function(){
    source.findLinked('planet', saturn.id, 'moons').then(function(moons){
      start();
      equal(moons.length, 1);
    });
  });
});

test("#findLinked - can filter has-many linked records based on permissions", function() {
  expect(1);
  stop();

  var titan, saturn, rhea, fbTitan, fbSaturn;

  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),
    source.add('moon', {name: "Rhea", isProtected: true}).then(function(sourceRhea){rhea = sourceRhea;})
  ])
  .then(function(){
    return all([
      source.addLink('planet', saturn.id, 'moons', titan.id),
      source.addLink('planet', saturn.id, 'moons', rhea.id)
    ]);
  })
  .then(function(){
    source.findLinked('planet', saturn.id, 'moons').then(function(moons){
      start();
      equal(moons.length, 1);
    });
  });
});

test("#findLink - can find has-one linked id", function() {
  expect(1);
  stop();

  var titan, saturn, fbTitan, fbSaturn;

  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),
  ])
  .then(function(){
    return source.addLink('moon', titan.id, 'planet', saturn.id);
  })
  .then(function(){
    source.findLink('moon', titan.id, 'planet').then(function(planetId){
      start();
      equal(planetId, saturn.id);
    });
  });
});

test("#findLinked - can find has-one linked record", function() {
  expect(1);
  stop();

  var titan, saturn, fbTitan, fbSaturn;

  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),
  ])
  .then(function(){
    return source.addLink('moon', titan.id, 'planet', saturn.id);
  })
  .then(function(){
    source.findLinked('moon', titan.id, 'planet').then(function(planet){
      start();
      equal(planet.id, saturn.id);
    });
  });
});
