/* global Firebase */
import Orbit from 'orbit/main';
import OC from 'orbit-common/main';
import Operation from 'orbit/operation';
import { uuid } from 'orbit/lib/uuid';
import Schema from 'orbit-common/schema';
import Source from 'orbit-common/source';
import FirebaseSource from 'orbit-firebase/firebase-source';
import FirebaseSerializer from 'orbit-firebase/firebase-serializer';
import { Promise, all, hash, denodeify,resolve, on, defer } from 'rsvp';
import { isArray } from 'orbit/lib/objects';
import Cache from 'orbit-common/cache';
import { arrayToHash } from 'orbit-firebase/lib/array-utils';

import FirebaseClient from 'orbit-firebase/firebase-client';
import FirebaseTransformer from 'orbit-firebase/firebase-transformer';

import AddRecordTransformer from 'orbit-firebase/transformers/add-record';
import { op, prepareFirebaseClient } from 'tests/test-helper';

var schemaDefinition = {
  modelDefaults: {
    keys: {
      'id': {primaryKey: true, defaultValue: uuid}
    }
  },
  models: {
    planet: {
      attributes: {
        name: {type: 'string'},
        classification: {type: 'string'},
        birthDate: {type: 'date'}
      },
      links: {
        moons: {type: 'hasMany', model: 'moon', inverse: 'planet'},
        races: {type: 'hasMany', model: 'race', inverse: 'planets'},
        next: {type: 'hasOne', model: 'planet', inverse: 'previous'},
        previous: {type: 'hasOne', model: 'planet', inverse: 'next'}
      }
    },
    moon: {
      attributes: {
        name: {type: 'string'}
      },
      links: {
        planet: {type: 'hasOne', model: 'planet', inverse: 'moons'}
      }
    },
    race: {
      attributes: {
        name: {type: 'string'},
      },
      links: {
        planets: {type: 'hasMany', model: 'planet', inverse: 'races'}
      }
    }
  }
};

var firebaseClient,
    firebaseTransformer,
    cache,
    schema;

///////////////////////////////////////////////////////////////////////////////

module("OC - FirebaseTransformer", {
  setup: function() {
    Orbit.Promise = Promise;
    Orbit.all = all;
    Orbit.resolve = resolve;

    schema = new Schema(schemaDefinition);
    var serializer = new FirebaseSerializer(schema);
    cache = new Cache(schema);

    stop();
    prepareFirebaseClient().then(function(preparedFirebaseClient){
      firebaseClient = preparedFirebaseClient;
      firebaseTransformer = new FirebaseTransformer(firebaseClient, schema, serializer, cache);
      start();
    });
  },

  teardown: function() {
  }
});

test("can add record", function(){
  expect(2);
  stop();

  var addJupiterOp = op('add', 'planet/1', schema.normalize('planet', {name: "Jupiter"}));

  firebaseTransformer.transform(addJupiterOp)
    .then(function(){
      firebaseClient.valueAt('planet/1').then(function(planet){
        start();

        ok(planet.id, "planet has an id");
        equal(planet.name, "Jupiter", "planet has a name");
      });
    });
});

test("can add record with relationships", function(){
  expect(3);
  stop();

  var titan = schema.normalize('moon', { id: 'titan', name: 'Titan' });
  var rhea = schema.normalize('moon', { id: 'rhea', name: 'Rhea' });

  var moonIds = {"titan": true, "rhea": true};
  var saturn = schema.normalize('planet', { id: 'saturn', name: 'Saturn', __rel: { moons: moonIds }});

  var addSaturnOp = op('add', 'planet/saturn', saturn);

  cache.reset({
    moon: { titan: titan, rhea: rhea },
    planet: {}
  });

  all([
    firebaseClient.set('/moon/titan', { id: 'titan', name: 'Titan', planet: null }),
    firebaseClient.set('/moon/rhea', { id: 'rhea', name: 'Rhea', planet: null }),

  ]).then(function(){
    return firebaseTransformer.transform(addSaturnOp);

  }).then(function(){
    return hash({
      moonIds: firebaseClient.valueAt('/planet/saturn/moons'),
      rheaPlanetId: firebaseClient.valueAt('/moon/rhea/planet'),
      titanPlanetId: firebaseClient.valueAt('/moon/titan/planet')
    });

  }).then(function(firebaseRelationships){
    start();
    deepEqual(firebaseRelationships.moonIds, {rhea: true, titan: true});
    equal(firebaseRelationships.rheaPlanetId, 'saturn');
    equal(firebaseRelationships.titanPlanetId, 'saturn');
  });
});

test("can remove record with relationships", function(){
  expect(2);
  stop();

  var moonIds = {"titan": true, "rhea": true};
  var saturn = schema.normalize('planet', { id: 'saturn', name: 'Saturn', __rel: { moons: moonIds }});
  var titan = schema.normalize('moon', { id: 'titan', name: 'Titan', __rel: { planet: 'saturn' } });
  var rhea = schema.normalize('moon', { id: 'rhea', name: 'Rhea', __rel: { planet: 'saturn' } });

  cache.reset({
    moon: { titan: titan, rhea: rhea },
    planet: { saturn: saturn }
  });

  all([
    firebaseClient.set('/moon/titan', { id: 'titan', name: 'Titan', planet: 'saturn' }),
    firebaseClient.set('/moon/rhea', { id: 'rhea', name: 'Rhea', planet: 'saturn' }),
    firebaseClient.set('/planet/saturn', { id: 'saturn', name: 'Saturn', moons: { titan: true, rhea: true } })

  ]).then(function(){
    return firebaseTransformer.transform(op('remove', 'planet/saturn'));

  }).then(function(){
    return hash({
      titanPlanetId: firebaseClient.valueAt('/moon/titan/planet'),
      rheaPlanetId: firebaseClient.valueAt('/moon/rhea/planet')
    });

  }).then(function(firebaseRelationships){
    start();
    equal(firebaseRelationships.titanPlanetId, null);
    equal(firebaseRelationships.rheaPlanetId, null);

  });
});

test("can remove record", function(){
  expect(1);
  stop();

  var jupiter = schema.normalize('planet', {name: "Jupiter"});

  cache.reset({
    planet: {
      jupiter: jupiter
    }
  });

  firebaseClient.set('/planet/jupiter', {id: 'jupiter', name: 'Jupiter'}).then(function(){
    return firebaseTransformer.transform(op('remove', '/planet/jupiter'));
    
  }).then(function(){
    firebaseClient.valueAt('planet/jupiter').then(function(planet){
      start();
      ok(!planet, "planet has been removed");
    });

  });
});

test("can replace attribute", function(){
  expect(1);
  stop();

  var replaceAttributeOp = op('add', 'planet/1', schema.normalize('planet', {name: "Jupiter"}));

  firebaseTransformer.transform(replaceAttributeOp)
    .then(function(){
      return firebaseTransformer.transform(op('replace', 'planet/1/name', 'Saturn'));

    })
    .then(function(){
      firebaseClient.valueAt('planet/1').then(function(planet){
        start();
        equal(planet.name, "Saturn");
      });

    });
});

test("can replace date attribute", function(){
  expect(1);
  stop();
  var originalDate = new Date(1428555600000);
  var modifiedDate = new Date(1428555800000);

  var addPlanetOp = op('add', 'planet/1', schema.normalize('planet', {birthDate: originalDate}));
  var replaceAttributeOp = op('replace', 'planet/1/birthDate', modifiedDate);

  firebaseTransformer.transform(addPlanetOp).then(function(){
    return firebaseTransformer.transform(replaceAttributeOp);

  })
  .then(function(){
    firebaseClient.valueAt('planet/1').then(function(planet){
      start();
      equal(planet.birthDate, modifiedDate.getTime());
    });

  });
});

test("can add attribute", function(){
  expect(1);
  stop();

  var addAttributeOp = op('add', 'planet/1', schema.normalize('planet', {name: "Jupiter"}));

  firebaseTransformer.transform(addAttributeOp).then(function(){
    return firebaseTransformer.transform(op('add', 'planet/1/name', 'Saturn'));

  })
  .then(function(){
    firebaseClient.valueAt('planet/1').then(function(planet){
      start();
      equal(planet.name, "Saturn");
    });

  });
});

/////////////////////////////////////////////////////////////////////////////
  // hasOne
  /////////////////////////////////////////////////////////////////////////////

test("add link - set hasOne", function(){
  expect(2);
  stop();

  var addMoonsPlanetOp = op('add', 'moon/titan/__rel/planet', 'saturn');

  var titan = schema.normalize('moon', { id: 'titan', name: 'Titan' });
  var saturn = schema.normalize('planet', { id: 'saturn', name: 'Saturn' });

  cache.reset({
    moon: { titan: titan },
    planet: { saturn: saturn }
  });

  firebaseTransformer.transform(addMoonsPlanetOp).then(function(){
    hash({
      planetId: firebaseClient.valueAt('moon/titan/planet'),
      moonIds: firebaseClient.valueAt('planet/saturn/moons')
    })
    .then(function(firebaseRelationships){
      start();

      equal(firebaseRelationships.planetId, 'saturn');
      ok(firebaseRelationships.moonIds.titan);
    });

  });
});

test("replace link - replace hasOne", function(){
  expect(2);
  stop();

  var replaceMoonsPlanetOp = op('replace', 'moon/titan/__rel/planet', 'saturn');

  var titan = schema.normalize('moon', { id: 'titan', name: 'Titan' });
  var saturn = schema.normalize('planet', { id: 'saturn', name: 'Saturn' });

  cache.reset({
    moon: { titan: titan },
    planet: { saturn: saturn }
  });

  firebaseTransformer.transform(replaceMoonsPlanetOp).then(function(){
    hash({
      planetId: firebaseClient.valueAt('moon/titan/planet'),
      moonIds: firebaseClient.valueAt('planet/saturn/moons')
    })
    .then(function(firebaseRelationships){
      start();

      equal(firebaseRelationships.planetId, 'saturn');
      ok(firebaseRelationships.moonIds.titan);
    });

  });
});

test("remove link - remove hasOne", function(){
  expect(2);
  stop();

  var removeTitanOp = op('remove', 'moon/titan/__rel/planet');

  cache.reset({
    moon: {
      titan: schema.normalize('moon', { id: 'titan', name: 'Titan', __rel: { planet: 'saturn' } }),
    },
    planet: {
      saturn: schema.normalize('planet', { id: 'saturn', name: 'Saturn', moons: { 'titan': true } })
    }
  });

  all([
    firebaseClient.set('/moon/titan', { id: 'titan', name: 'Titan', planet: 'saturn' }),
    firebaseClient.set('/planet/saturn', { id: 'saturn', name: 'Saturn', moons: { 'titan': true } })

  ]).then(function(){
    return firebaseTransformer.transform(removeTitanOp);

  }).then(function(){
    return hash({
      planetId: firebaseClient.valueAt('/moon/titan/planet'),
      moonIds: firebaseClient.valueAt('/planet/saturn/moons')

    });

  }).then(function(firebaseRelationships){
    start();
    equal(firebaseRelationships.planetId, null);
    equal(firebaseRelationships.moonIds, null);
    
  });

});

/////////////////////////////////////////////////////////////////////////////
  // hasMany that actsAsOrderedSet
  /////////////////////////////////////////////////////////////////////////////

// test("add link - add to hasMany that actsAsOrderedSet", function(){
//   expect(1);
//   stop();

//   var moonId = 3;

//   firebaseTransformer.transform(op('add', 'planet/1', {name: "Jupiter"}))
//   .then(function(){
//     return firebaseTransformer.transform(op('add', 'planet/1/__rel/moons/0', moonId))

//   })
//   .then(function(){
//     firebaseClient.valueAt('planet/1/moons').then(function(moons){
//       start();
//       equal(moons[0], moonId);
//     });

//   });
// });

// test("replace link - set hasMany that actsAsOrderedSet", function(){
//   stop();

//   var moonIds = [1,2,3];

//   firebaseTransformer.transform(op('add', 'moon/1', {name: "Titan"}))
//   .then(function(){
//     return firebaseTransformer.transform(op('replace', 'planet/1/__rel/moons', moonIds))

//   })
//   .then(function(){
//     firebaseClient.valueAt('planet/1/moons').then(function(firebaseMoonIds){
//       start();
//       deepEqual(firebaseMoonIds, moonIds);
//     });

//   });
// });

// test("remove link - remove from a hasMany that actsAsOrderedSet", function(){
//   stop();

//   var moonIds = [1,2,3];

//   firebaseTransformer.transform(op('add', 'moon/1', {name: "Titan"}))
//   .then(function(){
//     return firebaseTransformer.transform(op('replace', 'planet/1/__rel/moons', moonIds))

//   })
//   .then(function(){
//     return firebaseTransformer.transform(op('remove', 'planet/1/__rel/moons/0'))
//   })
//   .then(function(){
//     firebaseClient.valueAt('planet/1/moons').then(function(firebaseMoonIds){
//       start();
//       deepEqual(firebaseMoonIds, [2,3]);
//     });

//   });
// });


/////////////////////////////////////////////////////////////////////////////
  // hasMany
  /////////////////////////////////////////////////////////////////////////////

test("add link - add to hasMany", function(){
  expect(2);
  stop();

  var moonId = 3;
  var jupiter = schema.normalize('planet', { id: 'jupiter', name: 'Jupiter' });
  var europa = schema.normalize('moon', { id: 'europa', name: 'Europa' });

  cache.reset({
    planet: { jupiter: jupiter },
    moon: { europa: europa }
  });

  firebaseTransformer.transform(op('add', 'planet/jupiter', jupiter)).then(function(){
    return firebaseTransformer.transform(op('add', 'planet/jupiter/__rel/moons/europa', true));

  })
  .then(function(){
    return hash({
      moonIds: firebaseClient.valueAt('planet/jupiter/moons'),
      planetId: firebaseClient.valueAt('moon/europa/planet')
    });

  })
  .then(function(firebaseRelationships){
    start();
    equal(firebaseRelationships.moonIds.europa, true);
    equal(firebaseRelationships.planetId, 'jupiter');

  });
});

test("replace link - set hasMany", function(){
  expect(3);
  stop();

  var moonIds = {titan: true, rhea: true};
  var titan = schema.normalize('moon', { id: 'titan', name: 'Titan' });
  var rhea = schema.normalize('moon', { id: 'rhea', name: 'Rhea' });
  var saturn = schema.normalize('planet', { id: 'saturn', name: 'Saturn' });

  cache.reset({
    moon: { titan: titan, rhea: rhea },
    planet: { saturn: saturn }
  });

  firebaseTransformer.transform(op('add', 'moon/titan', titan)).then(function(){
    return firebaseTransformer.transform(op('replace', 'planet/saturn/__rel/moons', moonIds));

  })
  .then(function(){
    return hash({
      moonIds: firebaseClient.valueAt('planet/saturn/moons'),
      titanPlanetId: firebaseClient.valueAt('moon/titan/planet'),
      rheaPlanetId: firebaseClient.valueAt('moon/rhea/planet')
    });
  })
  .then(function(firebaseRelationships){
    start();
    deepEqual(firebaseRelationships.moonIds, {titan: true, rhea: true});
    equal(firebaseRelationships.titanPlanetId, 'saturn');
    equal(firebaseRelationships.rheaPlanetId, 'saturn');
    
  });

});

test("remove link - remove from a hasMany", function(){
  expect(2);
  stop();

  var moonIds = {"titan": true, "rhea": true};
  var saturn = schema.normalize('planet', { id: 'saturn', name: 'Saturn', __rel: { moons: moonIds }});
  var titan = schema.normalize('moon', { id: 'titan', name: 'Titan', __rel: { planet: 'saturn' } });
  var rhea = schema.normalize('moon', { id: 'rhea', name: 'Rhea', __rel: { planet: 'saturn' } });

  cache.reset({
    moon: { titan: titan, rhea: rhea },
    planet: { saturn: saturn }
  });

  all([
    firebaseClient.set('/moon/titan', { id: 'titan', name: 'Titan', planet: 'saturn' }),
    firebaseClient.set('/moon/rhea', { id: 'rhea', name: 'Rhea', planet: 'saturn' }),
    firebaseClient.set('/planet/saturn', { id: 'saturn', name: 'Saturn', moons: { titan: true, rhea: true } })

  ]).then(function(){
    return firebaseTransformer.transform(op('remove', 'planet/saturn/__rel/moons/titan'));

  }).then(function(){
    return hash({
      moonIds: firebaseClient.valueAt('planet/saturn/moons'),
      planetId: firebaseClient.valueAt('moon/titan/planet'),
    });

  }).then(function(firebaseRelationships){
    start();
    deepEqual(firebaseRelationships.moonIds, {rhea: true});
    equal(firebaseRelationships.planetId, null);

  });
});

/////////////////////////////////////////////////////////////////////////////
  // meta
  /////////////////////////////////////////////////////////////////////////////


test("meta is applied directly to the cache", function(){
  expect(1);
  stop();
  cache.transform(op('add', 'moon/1', {}));

  firebaseTransformer.transform(op('add', 'moon/1/__ref', "abc123"))
  .then(function(){
    start();
    equal(cache.retrieve('moon/1/__ref'), 'abc123', "cache has been updated");
  });
});













