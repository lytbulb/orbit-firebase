/* global Firebase */
import FirebaseClient from 'orbit-firebase/firebase-client';
import FirebaseConnector from 'orbit-firebase/firebase-connector';
import Orbit from 'orbit/main';
import OC from 'orbit-common/main';
import Cache from 'orbit-common/cache';
import Schema from 'orbit-common/schema';
import { uuid } from 'orbit/lib/uuid';
import { Promise } from 'rsvp';
import { op } from 'tests/test-helper';
import { Class } from 'orbit/lib/objects';
import Evented from 'orbit/evented';

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
        classification: {type: 'string'}
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

var SourceStub = Class.extend({
  init: function(){
    Evented.extend(this);
  },

  transform: function(operation){
    this.emit("didTransform", operation);
  }
});

var firebaseRef,
    firebaseClient,
    firebaseConnector,
    source,
    cache;

module("OF - FirebaseConnector", {
  setup: function() {
    Orbit.Promise = Promise;
    var schema = new Schema(schemaDefinition);
    cache = new Cache(schema);
    source = new SourceStub();
    firebaseConnector = new FirebaseConnector(source, cache, schema);
  },

  teardown: function() {
  }
});

function operationsEqual(actual, expected){
  equal(actual.length, expected.length, 'same number of operations');

  for(var i = 0; i < actual.length; i++){
    var actualOp = actual[i];
    var expectedOp = expected[i];

    deepEqual(actualOp, expectedOp);
  }
}

test("buildTransformation - doesn't apply addToHasMany operation if record doesn't exist", function(){
  cache.reset({});

  var operations = firebaseConnector.buildTransformation(op('add', 'planet/planet1/__rel/moons/moon1', true));
  deepEqual(operations, [], 'no operations were included in the transformation');
});

test("buildTransformation - doesn't apply addToHasMany operation if already present in hasMany", function(){
  var jupiter = { id: 'jupiter', name: "Jupiter", __rel: { moons: {'europa': true} }};

  cache.reset({
    planet: {
      jupiter: jupiter
    }
  });

  var operations = firebaseConnector.buildTransformation(op('add', 'planet/jupiter/__rel/moons/europa', true));
  deepEqual(operations, [], 'no operations were included in the transformation');
});

test("buildTransformation - doesn't apply removeFromHasMany operation if record doesn't exist", function(){
  cache.reset({});

  var operations = firebaseConnector.buildTransformation(op('remove', 'planet/planet1/__rel/moons/moon1'));
  deepEqual(operations, [], 'no operations were included in the transformation');
});

test("buildTransformation - doesn't apply addHasMany operation if record doesn't exist", function(){
  cache.reset({});

  var operations = firebaseConnector.buildTransformation(op('add', 'planet/planet1/__rel/moons', {}));
  deepEqual(operations, [], 'no operations were included in the transformation');
});

test("buildTransformation - doesn't apply replaceHasMany operation if record doesn't exist", function(){
  cache.reset({});

  var operations = firebaseConnector.buildTransformation(op('replace', 'planet/planet1/__rel/moons', {}));
  deepEqual(operations, [], 'no operations were included in the transformation');
});

test("buildTransformation - doesn't apply removeHasMany operation if record doesn't exist", function(){
  cache.reset({});

  var operations = firebaseConnector.buildTransformation(op('remove', 'planet/planet1/__rel/moons'));
  deepEqual(operations, [], 'no operations were included in the transformation');
});

test("buildTransformation - add record not applied if record already exists", function(){
  var jupiter = { id: 'jupiter', name: "Jupiter"};

  cache.reset({
    planet: {
      jupiter: jupiter
    }
  });

  var addRecordOperation = op('add', 'planet/jupiter', jupiter);

  var operations = firebaseConnector.buildTransformation(addRecordOperation);
  deepEqual(operations, [], 'no operations were included in the transformation');

});

test("buildTransformation - replace record applied if currentValue different to desiredValue", function(){
  var jupiter = { id: 'jupiter', name: "Jupiter"};
  var jupiter2 = { id: 'jupiter', name: "Jupiter2"};

  cache.reset({
    planet: {
      jupiter: jupiter
    }
  });

  var replaceRecordOperation = op('replace', 'planet/jupiter', jupiter2);

  var operations = firebaseConnector.buildTransformation(replaceRecordOperation);
  operationsEqual(operations, [replaceRecordOperation]);
});

test("buildTransformation - replace record not applied if currentValue equals desiredValue", function(){
  var jupiter = { id: 'jupiter', name: "Jupiter"};

  cache.reset({
    planet: {
      jupiter: jupiter
    }
  });

  var replaceRecordOperation = op('replace', 'planet/jupiter', jupiter);

  var operations = firebaseConnector.buildTransformation(replaceRecordOperation);
  operationsEqual(operations, []);
});

test("buildTransformation - add hasMany applied if LINK_NOT_INITIALIZED", function(){
  var jupiter = { id: 'jupiter', name: "Jupiter", __rel: { moons: OC.LINK_NOT_INITIALIZED }};

  cache.reset({
    planet: {
      jupiter: jupiter
    }
  });

  var addHasManyOperation = op('add', 'planet/jupiter/__rel/moons', {});

  var operations = firebaseConnector.buildTransformation(addHasManyOperation);
  operationsEqual(operations, [addHasManyOperation]);
});

test("buildTransformation - add hasMany not applied if already set", function(){
  var jupiter = { id: 'jupiter', name: "Jupiter", __rel: { moons: {} }};

  cache.reset({
    planet: {
      jupiter: jupiter
    }
  });

  var addHasManyOperation = op('add', 'planet/jupiter/__rel/moons', {});

  var operations = firebaseConnector.buildTransformation(addHasManyOperation);
  operationsEqual(operations, []);
});

test("buildTransformation - replace hasMany applied even if already set", function(){
  var jupiter = { id: 'jupiter', name: "Jupiter", __rel: { moons: {} }};

  cache.reset({
    planet: {
      jupiter: jupiter
    }
  });

  var replaceHasManyOperation = op('replace', 'planet/jupiter/__rel/moons', { 'moon1': true });

  var operations = firebaseConnector.buildTransformation(replaceHasManyOperation);
  operationsEqual(operations, [replaceHasManyOperation]);
});

test("buildTransformation - replace hasMany not applied if currentValue equals desiredValue", function(){
  var jupiter = { id: 'jupiter', name: "Jupiter", __rel: { moons: { 'moon1': true } }};

  cache.reset({
    planet: {
      jupiter: jupiter
    }
  });

  var replaceHasManyOperation = op('replace', 'planet/jupiter/__rel/moons', { 'moon1': true });

  var operations = firebaseConnector.buildTransformation(replaceHasManyOperation);
  operationsEqual(operations, []);
});

test("buildTransformation - add to hasMany is applied if hasMany has been set", function(){
  var jupiter = { id: 'jupiter', name: "Jupiter", __rel: { moons: { 'moon1': true } }};

  cache.reset({
    planet: {
      jupiter: jupiter
    }
  });

  var addToHasManyOperation = op('add', 'planet/jupiter/__rel/moons/moon2', true);

  var operations = firebaseConnector.buildTransformation(addToHasManyOperation);
  operationsEqual(operations, [addToHasManyOperation]);
});

test("buildTransformation - add to hasMany throws error if LINK_NOT_INITIALIZED", function(){
  var jupiter = { id: 'jupiter', name: "Jupiter", __rel: { moons: OC.LINK_NOT_INITIALIZED }};

  cache.reset({
    planet: {
      jupiter: jupiter
    }
  });

  var addToHasManyOperation = op('add', 'planet/jupiter/__rel/moons/moon2', true);

  try {
    var operations = firebaseConnector.buildTransformation(addToHasManyOperation);
    ok(false, 'add to hasMany not allowed if link has not been initialized');
  }
  catch(error){
    ok(true, 'add to hasMany throws an error if link has not been initialized');
  }
});

test("buildTransformation - remove from hasMany is applied if hasMany has been set", function(){
  var jupiter = { id: 'jupiter', name: "Jupiter", __rel: { moons: { 'moon1': true } }};

  cache.reset({
    planet: {
      jupiter: jupiter
    }
  });

  var removeFromHasManyOperation = op('remove', 'planet/jupiter/__rel/moons/moon2', true);

  var operations = firebaseConnector.buildTransformation(removeFromHasManyOperation);
  operationsEqual(operations, [removeFromHasManyOperation]);
});

test("buildTransformation - remove from hasMany throws error if LINK_NOT_INITIALIZED", function(){
  var jupiter = { id: 'jupiter', name: "Jupiter", __rel: { moons: OC.LINK_NOT_INITIALIZED }};

  cache.reset({
    planet: {
      jupiter: jupiter
    }
  });

  var removeFromHasManyOperation = op('remove', 'planet/jupiter/__rel/moons/moon2', true);

  try {
    var operations = firebaseConnector.buildTransformation(removeFromHasManyOperation);
    ok(false, 'remove from hasMany not allowed if link has not been initialized');
  }
  catch(error){
    ok(true, 'remove from hasMany throws an error if link has not been initialized');
  }
});

test("buildTransformation - add hasOne applied if LINK_NOT_INITIALIZED", function(){
  var europa = { id: 'europa', name: 'Europa', __rel: { planet: OC.LINK_NOT_INITIALIZED }};

  cache.reset({
    moon: {
      europa: europa
    }
  });

  var addHasOneOperation = op('add', 'moon/europa/__rel/planet', 'jupiter');

  var operations = firebaseConnector.buildTransformation(addHasOneOperation);
  operationsEqual(operations, [addHasOneOperation]);
});

test("buildTransformation - add hasOne not applied if already set", function(){
  var europa = { id: 'europa', name: 'Europa', __rel: { planet: 'saturn' }};

  cache.reset({
    moon: {
      europa: europa
    }
  });

  var addHasOneOperation = op('add', 'moon/europa/__rel/planet', 'jupiter');

  var operations = firebaseConnector.buildTransformation(addHasOneOperation);
  operationsEqual(operations, []);
});

test("buildTransformation - replace hasOne applied even if already set", function(){
  var europa = { id: 'europa', name: 'Europa', __rel: { planet: 'saturn' }};

  cache.reset({
    moon: {
      europa: europa
    }
  });

  var replaceHasOneOperation = op('replace', 'moon/europa/__rel/planet', 'jupiter');

  var operations = firebaseConnector.buildTransformation(replaceHasOneOperation);
  operationsEqual(operations, [replaceHasOneOperation]);
});

test("buildTransformation - replace hasOne not applied if currentValue equals desiredValue", function(){
  var europa = { id: 'europa', name: 'Europa', __rel: { planet: 'jupiter' }};

  cache.reset({
    moon: {
      europa: europa
    }
  });

  var replaceHasOneOperation = op('replace', 'moon/europa/__rel/planet', 'jupiter');

  var operations = firebaseConnector.buildTransformation(replaceHasOneOperation);
  operationsEqual(operations, []);
});

test("buildTransformation - add attribute applied if different", function(){
  var europa = { id: 'europa', name: 'Europa', __rel: { planet: 'jupiter' }};

  cache.reset({
    moon: {
      europa: europa
    }
  });

  var addAttributeOperation = op('add', 'moon/europa/name', 'europa2');

  var operations = firebaseConnector.buildTransformation(addAttributeOperation);
  operationsEqual(operations, [addAttributeOperation]);
});

test("buildTransformation - replace attribute applied if different", function(){
  var europa = { id: 'europa', name: 'Europa', __rel: { planet: 'jupiter' }};

  cache.reset({
    moon: {
      europa: europa
    }
  });

  var replaceAttributeOperation = op('replace', 'moon/europa/name', 'europa2');

  var operations = firebaseConnector.buildTransformation(replaceAttributeOperation);
  operationsEqual(operations, [replaceAttributeOperation]);
});

test("buildTransformation - add attribute not applied if currentValue equals desiredValue", function(){
  var europa = { id: 'europa', name: 'Europa', __rel: { planet: 'jupiter' }};

  cache.reset({
    moon: {
      europa: europa
    }
  });

  var addAttributeOperation = op('add', 'moon/europa/name', 'Europa');

  var operations = firebaseConnector.buildTransformation(addAttributeOperation);
  operationsEqual(operations, []);
});


test("buildTransformation - replace attribute not applied if currentValue equals desiredValue", function(){
  var europa = { id: 'europa', name: 'Europa', __rel: { planet: 'jupiter' }};

  cache.reset({
    moon: {
      europa: europa
    }
  });

  var replaceAttributeOperation = op('replace', 'moon/europa/name', 'Europa');

  var operations = firebaseConnector.buildTransformation(replaceAttributeOperation);
  operationsEqual(operations, []);
});




